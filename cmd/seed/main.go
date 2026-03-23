package main

import (
	"bytes"
	"crypto/tls"
	"database/sql"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"math/rand"
	"net/http"
	"os"
	"strings"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
)

func openDB(dsn string) (*sql.DB, error) {
	return sql.Open("pgx", dsn)
}

// --- Configuration ---

type account struct {
	Email    string
	Password string
}

var defaultAccounts = []account{
	{Email: "info@acme.customer.mhst.io", Password: "test1234"},
	{Email: "support@acme.customer.mhst.io", Password: "test1234"},
	{Email: "sarah.chen@acme.customer.mhst.io", Password: "test1234"},
	{Email: "marcus.johnson@acme.customer.mhst.io", Password: "test1234"},
	{Email: "priya.patel@acme.customer.mhst.io", Password: "test1234"},
	{Email: "alex.rivera@acme.customer.mhst.io", Password: "test1234"},
	{Email: "emma.larsson@acme.customer.mhst.io", Password: "test1234"},
}

// Internal colleague directory — used for emails, contacts, and calendar participants.
type colleague struct {
	Local string // local part of email
	Name  string
}

var allColleagues = []colleague{
	{"info", "Acme Info"},
	{"support", "Acme Support"},
	{"sarah.chen", "Sarah Chen"},
	{"marcus.johnson", "Marcus Johnson"},
	{"priya.patel", "Priya Patel"},
	{"alex.rivera", "Alex Rivera"},
	{"emma.larsson", "Emma Larsson"},
}

const domain = "acme.customer.mhst.io"

func colleagueEmail(c colleague) string {
	return c.Local + "@" + domain
}

func findColleague(local string) colleague {
	for _, c := range allColleagues {
		if c.Local == local {
			return c
		}
	}
	return colleague{Local: local, Name: local}
}

// --- JMAP types ---

type jmapRequest struct {
	Using       []string        `json:"using"`
	MethodCalls [][]interface{} `json:"methodCalls"`
}

type jmapResponse struct {
	MethodResponses [][]json.RawMessage `json:"methodResponses"`
	SessionState    string              `json:"sessionState"`
}

type jmapSession struct {
	Capabilities map[string]json.RawMessage `json:"capabilities"`
	Accounts     map[string]struct {
		Name                string                     `json:"name"`
		IsPersonal          bool                       `json:"isPersonal"`
		AccountCapabilities map[string]json.RawMessage `json:"accountCapabilities"`
	} `json:"accounts"`
	PrimaryAccounts map[string]string `json:"primaryAccounts"`
	UploadURL       string            `json:"uploadUrl"`
	DownloadURL     string            `json:"downloadUrl"`
}

// --- Client ---

type client struct {
	baseURL     string
	webmailURL  string
	email       string
	password    string
	httpClient  *http.Client
	accountID   string
	session     *jmapSession
	sessionCookie string // webmail API session cookie
}

func newClient(baseURL, webmailURL, email, password string) *client {
	return &client{
		baseURL:    strings.TrimRight(baseURL, "/"),
		webmailURL: strings.TrimRight(webmailURL, "/"),
		email:      email,
		password:   password,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
			Transport: &http.Transport{
				TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
			},
		},
	}
}

// loginWebmail authenticates with the webmail API and stores the session cookie.
func (c *client) loginWebmail() error {
	if c.webmailURL == "" {
		return fmt.Errorf("no webmail URL configured")
	}
	body, _ := json.Marshal(map[string]string{"email": c.email, "password": c.password})
	resp, err := c.httpClient.Post(c.webmailURL+"/api/auth/login", "application/json", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("login request: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 && resp.StatusCode != 302 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("login failed (%d): %s", resp.StatusCode, string(b))
	}
	// Extract session cookie
	for _, cookie := range resp.Cookies() {
		if cookie.Name == "webmail_session" || cookie.Name == "session" || cookie.Name == "sid" {
			c.sessionCookie = cookie.Name + "=" + cookie.Value
			return nil
		}
	}
	// Try any cookie
	if len(resp.Cookies()) > 0 {
		ck := resp.Cookies()[0]
		c.sessionCookie = ck.Name + "=" + ck.Value
		return nil
	}
	return fmt.Errorf("no session cookie in login response")
}

// saveParticipants saves event participants to the webmail DB via the webmail API.
func (c *client) saveParticipants(eventID string, participants []map[string]string) error {
	if c.sessionCookie == "" {
		if err := c.loginWebmail(); err != nil {
			return err
		}
	}

	body, err := json.Marshal(participants)
	if err != nil {
		return err
	}

	req, err := http.NewRequest("PUT", c.webmailURL+"/api/events/"+eventID+"/participants", bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Cookie", c.sessionCookie)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("PUT participants failed (%d): %s", resp.StatusCode, string(b))
	}
	return nil
}

func (c *client) fetchSession() error {
	req, err := http.NewRequest("GET", c.baseURL+"/.well-known/jmap", nil)
	if err != nil {
		return fmt.Errorf("creating session request: %w", err)
	}
	req.SetBasicAuth(c.email, c.password)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("fetching session: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("session request failed (%d): %s", resp.StatusCode, string(body))
	}

	var sess jmapSession
	if err := json.NewDecoder(resp.Body).Decode(&sess); err != nil {
		return fmt.Errorf("decoding session: %w", err)
	}
	c.session = &sess

	// Find accountID for the mail capability
	if id, ok := sess.PrimaryAccounts["urn:ietf:params:jmap:mail"]; ok {
		c.accountID = id
	} else {
		// Fallback: pick any account
		for id := range sess.Accounts {
			c.accountID = id
			break
		}
	}

	if c.accountID == "" {
		return fmt.Errorf("no account found in JMAP session")
	}

	return nil
}

func (c *client) hasCapability(cap string) bool {
	if c.session == nil {
		return false
	}
	_, ok := c.session.Capabilities[cap]
	return ok
}

func (c *client) jmapCall(req jmapRequest) (*jmapResponse, error) {
	body, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("marshaling request: %w", err)
	}

	httpReq, err := http.NewRequest("POST", c.baseURL+"/jmap/", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("creating request: %w", err)
	}
	httpReq.SetBasicAuth(c.email, c.password)
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("JMAP call: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("reading response: %w", err)
	}

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("JMAP call failed (%d): %s", resp.StatusCode, string(respBody))
	}

	var jmapResp jmapResponse
	if err := json.Unmarshal(respBody, &jmapResp); err != nil {
		return nil, fmt.Errorf("decoding response: %s\nBody: %s", err, string(respBody))
	}

	return &jmapResp, nil
}

func (c *client) uploadBlob(data []byte) (string, error) {
	url := c.baseURL + "/jmap/upload/" + c.accountID + "/"
	req, err := http.NewRequest("POST", url, bytes.NewReader(data))
	if err != nil {
		return "", fmt.Errorf("creating upload request: %w", err)
	}
	req.SetBasicAuth(c.email, c.password)
	req.Header.Set("Content-Type", "message/rfc822")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("uploading blob: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("reading upload response: %w", err)
	}

	if resp.StatusCode != 200 && resp.StatusCode != 201 {
		return "", fmt.Errorf("upload failed (%d): %s", resp.StatusCode, string(body))
	}

	var result struct {
		BlobID string `json:"blobId"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return "", fmt.Errorf("decoding upload response: %s\nBody: %s", err, string(body))
	}

	return result.BlobID, nil
}

// --- Mailbox helpers ---

type mailboxes struct {
	Inbox  string
	Sent   string
	Drafts string
	Junk   string
	Trash  string
}

func (c *client) getMailboxes() (*mailboxes, error) {
	resp, err := c.jmapCall(jmapRequest{
		Using: []string{"urn:ietf:params:jmap:mail"},
		MethodCalls: [][]interface{}{
			{"Mailbox/get", map[string]interface{}{
				"accountId":  c.accountID,
				"properties": []string{"id", "name", "role"},
			}, "0"},
		},
	})
	if err != nil {
		return nil, err
	}

	var result struct {
		List []struct {
			ID   string  `json:"id"`
			Name string  `json:"name"`
			Role *string `json:"role"`
		} `json:"list"`
	}
	if err := json.Unmarshal(resp.MethodResponses[0][1], &result); err != nil {
		return nil, fmt.Errorf("decoding mailboxes: %w", err)
	}

	mb := &mailboxes{}
	for _, m := range result.List {
		if m.Role == nil {
			continue
		}
		switch *m.Role {
		case "inbox":
			mb.Inbox = m.ID
		case "sent":
			mb.Sent = m.ID
		case "drafts":
			mb.Drafts = m.ID
		case "junk":
			mb.Junk = m.ID
		case "trash":
			mb.Trash = m.ID
		}
	}

	if mb.Inbox == "" {
		return nil, fmt.Errorf("inbox mailbox not found")
	}

	return mb, nil
}

// --- Clean ---

func (c *client) cleanEmails() error {
	// Get all email IDs
	resp, err := c.jmapCall(jmapRequest{
		Using: []string{"urn:ietf:params:jmap:mail"},
		MethodCalls: [][]interface{}{
			{"Email/query", map[string]interface{}{
				"accountId": c.accountID,
				"limit":     1000,
			}, "0"},
		},
	})
	if err != nil {
		return err
	}

	var queryResult struct {
		IDs []string `json:"ids"`
	}
	if err := json.Unmarshal(resp.MethodResponses[0][1], &queryResult); err != nil {
		return fmt.Errorf("decoding email query: %w", err)
	}

	if len(queryResult.IDs) == 0 {
		return nil
	}

	// Delete all emails
	destroy := make([]string, len(queryResult.IDs))
	copy(destroy, queryResult.IDs)

	_, err = c.jmapCall(jmapRequest{
		Using: []string{"urn:ietf:params:jmap:mail"},
		MethodCalls: [][]interface{}{
			{"Email/set", map[string]interface{}{
				"accountId": c.accountID,
				"destroy":   destroy,
			}, "0"},
		},
	})
	return err
}

func (c *client) cleanContacts() error {
	resp, err := c.jmapCall(jmapRequest{
		Using: []string{"urn:ietf:params:jmap:contacts"},
		MethodCalls: [][]interface{}{
			{"ContactCard/query", map[string]interface{}{
				"accountId": c.accountID,
				"limit":     1000,
			}, "0"},
		},
	})
	if err != nil {
		return err
	}
	var queryResult struct {
		IDs []string `json:"ids"`
	}
	if err := json.Unmarshal(resp.MethodResponses[0][1], &queryResult); err != nil {
		return err
	}
	if len(queryResult.IDs) == 0 {
		return nil
	}
	_, err = c.jmapCall(jmapRequest{
		Using: []string{"urn:ietf:params:jmap:contacts"},
		MethodCalls: [][]interface{}{
			{"ContactCard/set", map[string]interface{}{
				"accountId": c.accountID,
				"destroy":   queryResult.IDs,
			}, "0"},
		},
	})
	return err
}

func (c *client) cleanCalendarEvents() error {
	resp, err := c.jmapCall(jmapRequest{
		Using: []string{"urn:ietf:params:jmap:calendars"},
		MethodCalls: [][]interface{}{
			{"CalendarEvent/query", map[string]interface{}{
				"accountId": c.accountID,
				"limit":     1000,
			}, "0"},
		},
	})
	if err != nil {
		return err
	}
	var queryResult struct {
		IDs []string `json:"ids"`
	}
	if err := json.Unmarshal(resp.MethodResponses[0][1], &queryResult); err != nil {
		return err
	}
	if len(queryResult.IDs) == 0 {
		return nil
	}
	_, err = c.jmapCall(jmapRequest{
		Using: []string{"urn:ietf:params:jmap:calendars"},
		MethodCalls: [][]interface{}{
			{"CalendarEvent/set", map[string]interface{}{
				"accountId": c.accountID,
				"destroy":   queryResult.IDs,
			}, "0"},
		},
	})
	return err
}

// --- Email data ---

type emailSpec struct {
	From        string
	FromName    string
	To          string
	Subject     string
	HTMLBody    string
	Date        time.Time
	MailboxID   string
	IsRead      bool
	IsFlagged   bool
	IsDraft     bool
	InReplyTo   string
	References  string
	MessageID   string
	Attachments []attachmentSpec
}

type attachmentSpec struct {
	Filename    string
	ContentType string
	Content     []byte
}

func buildRFC822(spec emailSpec) []byte {
	var buf bytes.Buffer
	messageID := spec.MessageID
	if messageID == "" {
		messageID = fmt.Sprintf("<%d.%d@seed.local>", spec.Date.UnixNano(), rand.Int63())
	}

	buf.WriteString(fmt.Sprintf("Message-ID: %s\r\n", messageID))
	buf.WriteString(fmt.Sprintf("Date: %s\r\n", spec.Date.Format(time.RFC1123Z)))
	buf.WriteString(fmt.Sprintf("From: %s <%s>\r\n", spec.FromName, spec.From))
	buf.WriteString(fmt.Sprintf("To: %s\r\n", spec.To))
	buf.WriteString(fmt.Sprintf("Subject: %s\r\n", spec.Subject))
	buf.WriteString("MIME-Version: 1.0\r\n")

	if spec.InReplyTo != "" {
		buf.WriteString(fmt.Sprintf("In-Reply-To: %s\r\n", spec.InReplyTo))
	}
	if spec.References != "" {
		buf.WriteString(fmt.Sprintf("References: %s\r\n", spec.References))
	}

	if len(spec.Attachments) > 0 {
		boundary := fmt.Sprintf("boundary_%d", rand.Int63())
		buf.WriteString(fmt.Sprintf("Content-Type: multipart/mixed; boundary=\"%s\"\r\n", boundary))
		buf.WriteString("\r\n")
		buf.WriteString(fmt.Sprintf("--%s\r\n", boundary))
		buf.WriteString("Content-Type: text/html; charset=utf-8\r\n")
		buf.WriteString("Content-Transfer-Encoding: 7bit\r\n")
		buf.WriteString("\r\n")
		buf.WriteString(spec.HTMLBody)
		buf.WriteString("\r\n")

		for _, att := range spec.Attachments {
			buf.WriteString(fmt.Sprintf("--%s\r\n", boundary))
			buf.WriteString(fmt.Sprintf("Content-Type: %s; name=\"%s\"\r\n", att.ContentType, att.Filename))
			buf.WriteString(fmt.Sprintf("Content-Disposition: attachment; filename=\"%s\"\r\n", att.Filename))
			buf.WriteString("Content-Transfer-Encoding: base64\r\n")
			buf.WriteString("\r\n")
			buf.WriteString("VGhpcyBpcyBhIHRlc3QgYXR0YWNobWVudCBmaWxlIGNvbnRlbnQu")
			buf.WriteString("\r\n")
		}
		buf.WriteString(fmt.Sprintf("--%s--\r\n", boundary))
	} else {
		buf.WriteString("Content-Type: text/html; charset=utf-8\r\n")
		buf.WriteString("Content-Transfer-Encoding: 7bit\r\n")
		buf.WriteString("\r\n")
		buf.WriteString(spec.HTMLBody)
		buf.WriteString("\r\n")
	}

	return buf.Bytes()
}

func (c *client) importEmail(spec emailSpec) error {
	raw := buildRFC822(spec)
	blobID, err := c.uploadBlob(raw)
	if err != nil {
		return fmt.Errorf("uploading email blob: %w", err)
	}

	keywords := map[string]bool{}
	if spec.IsRead {
		keywords["$seen"] = true
	}
	if spec.IsFlagged {
		keywords["$flagged"] = true
	}
	if spec.IsDraft {
		keywords["$draft"] = true
	}

	mailboxIDs := map[string]bool{
		spec.MailboxID: true,
	}

	_, err = c.jmapCall(jmapRequest{
		Using: []string{"urn:ietf:params:jmap:mail"},
		MethodCalls: [][]interface{}{
			{"Email/import", map[string]interface{}{
				"accountId": c.accountID,
				"emails": map[string]interface{}{
					"e1": map[string]interface{}{
						"blobId":     blobID,
						"mailboxIds": mailboxIDs,
						"keywords":   keywords,
						"receivedAt": spec.Date.UTC().Format("2006-01-02T15:04:05Z"),
					},
				},
			}, "0"},
		},
	})
	if err != nil {
		return fmt.Errorf("importing email: %w", err)
	}

	return nil
}

// --- Email generators ---

func randomDate(daysBack int) time.Time {
	now := time.Now()
	offset := rand.Intn(daysBack * 24)
	return now.Add(-time.Duration(offset) * time.Hour)
}

func wrapHTML(body string) string {
	return fmt.Sprintf(`<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
%s
</body>
</html>`, body)
}

type sender struct {
	Name  string
	Email string
}

// ---- Internal threaded conversations (the bulk of email) ----

type internalConversation struct {
	subject  string
	messages []struct {
		fromLocal string // local part of sender address
		body      string
	}
}

func generateInternalThreads(acctEmail string, mb *mailboxes) []emailSpec {
	acctLocal := strings.SplitN(acctEmail, "@", 2)[0]

	conversations := []internalConversation{
		// Thread 1: API Migration Plan — sarah.chen, marcus.johnson, alex.rivera
		{
			subject: "API Migration Plan",
			messages: []struct {
				fromLocal string
				body      string
			}{
				{"sarah.chen", `<p>Hey team,</p>
<p>I've put together a plan for migrating from v2 to v3 of our public API. Here are the main changes:</p>
<ul>
<li>New authentication flow using OAuth2 with PKCE</li>
<li>Cursor-based pagination replacing offset pagination</li>
<li>Stricter rate limiting (100 req/min for free tier, 1000 for paid)</li>
</ul>
<p>I've shared the full RFC in Notion. Can you both review by end of week?</p>
<p>Sarah</p>`},
				{"alex.rivera", `<p>Thanks Sarah, just read through it.</p>
<p>The OAuth2 change makes sense. Two questions:</p>
<ol>
<li>What's the deprecation timeline for v2? We have external partners still on it.</li>
<li>Should we ship SDK updates alongside or can they lag behind?</li>
</ol>
<p>Also, I can set up the new rate limiter in our API gateway this sprint if we agree on the limits.</p>
<p>Alex</p>`},
				{"marcus.johnson", `<p>Solid plan. I like the cursor-based pagination — our current offset approach falls apart on large datasets.</p>
<p>Re: Alex's questions, I'd suggest a 6-month deprecation window with v2 in maintenance mode from day one. SDKs should ship within 2 weeks of the API launch — we can't leave integrators hanging.</p>
<p>One addition: can we include a compatibility shim so v2 requests get auto-translated? Would make the transition way smoother for existing customers.</p>
<p>Marcus</p>`},
				{"sarah.chen", `<p>Great feedback from both of you. Updated the RFC:</p>
<ul>
<li>6-month deprecation window for v2 (Marcus's suggestion)</li>
<li>SDK updates ship within 2 weeks of API launch</li>
<li>Alex will prototype the rate limiter this sprint</li>
<li>Compatibility shim added to the roadmap (Marcus to spec it out)</li>
</ul>
<p>Let's finalize in Thursday's architecture review. I'll add it to the agenda.</p>
<p>Sarah</p>`},
			},
		},
		// Thread 2: Office Party Planning — emma.larsson, priya.patel, sarah.chen
		{
			subject: "Office Party Planning",
			messages: []struct {
				fromLocal string
				body      string
			}{
				{"emma.larsson", `<p>Hi everyone!</p>
<p>Time to plan our spring office party. Here's what I'm thinking:</p>
<ul>
<li><strong>Date:</strong> Last Friday of March</li>
<li><strong>Venue:</strong> The rooftop terrace (confirmed availability)</li>
<li><strong>Theme:</strong> Spring garden party</li>
<li><strong>Budget:</strong> $3,000</li>
</ul>
<p>I need volunteers for catering, decorations, and entertainment. Who's in?</p>
<p>Emma</p>`},
				{"priya.patel", `<p>Love the garden theme! I'll handle decorations — I have some great ideas for floral arrangements and string lights.</p>
<p>For music, my friend's band does acoustic sets and they're really good. They'd probably do it for $600.</p>
<p>Should we set up a shared doc for planning?</p>
<p>Priya</p>`},
				{"sarah.chen", `<p>Count me in for catering! I'll send out a dietary restrictions survey today.</p>
<p>Budget breakdown suggestion:</p>
<ul>
<li>Catering: $1,500</li>
<li>Decorations: $400</li>
<li>Music: $600</li>
<li>Drinks: $400</li>
<li>Contingency: $100</li>
</ul>
<p>Does that work for everyone?</p>
<p>Sarah</p>`},
				{"emma.larsson", `<p>Perfect breakdown, Sarah. Priya, the band sounds great — go ahead and book them.</p>
<p>I've created the planning doc: <a href="https://docs.google.com/party-planning">Party Planning Sheet</a></p>
<p>Let's meet Thursday at 2pm to finalize details. I booked the small conference room.</p>
<p>This is going to be fun!</p>
<p>Emma</p>`},
			},
		},
		// Thread 3: Customer Escalation — support, marcus.johnson, priya.patel
		{
			subject: "Customer Escalation - Northwind Corp",
			messages: []struct {
				fromLocal string
				body      string
			}{
				{"support", `<p>Team,</p>
<p>We have a P1 escalation from Northwind Corp (Enterprise tier). Their admin reports that bulk email imports have been failing intermittently since yesterday.</p>
<p><strong>Impact:</strong> ~200 users affected, migration from legacy system blocked</p>
<p><strong>Error:</strong> <code>HTTP 503 - Service Temporarily Unavailable</code> on the import endpoint</p>
<p>Customer is requesting an update within 2 hours. Can someone investigate?</p>
<p>Acme Support</p>`},
				{"marcus.johnson", `<p>I'm on it. Checked the logs — the import worker is hitting memory limits when processing large batches (&gt;50 messages). The OOM killer is restarting the pod.</p>
<p>Quick fix: increase the memory limit from 512MB to 1GB. Long-term: we need to implement chunked imports.</p>
<p>I can deploy the memory bump in 30 minutes. Priya, can you check the UI side? The error message shown to users is just a generic 503 — we should show something more helpful.</p>
<p>Marcus</p>`},
				{"priya.patel", `<p>Good catch, Marcus. I'll update the import UI to:</p>
<ol>
<li>Show a specific error message for import failures</li>
<li>Add a retry button</li>
<li>Suggest smaller batch sizes in the meantime</li>
</ol>
<p>I can have the UI fix ready by end of day. Should I also update the status page?</p>
<p>Priya</p>`},
				{"support", `<p>Thanks both. Updates:</p>
<ul>
<li>Marcus deployed the memory fix — imports are succeeding again</li>
<li>Priya's UI improvements are in review</li>
<li>I've updated the customer and the status page</li>
</ul>
<p>Northwind confirmed they can proceed with their migration. Marking this as resolved.</p>
<p>Let's do a quick post-mortem tomorrow to discuss the chunked import work.</p>
<p>Acme Support</p>`},
			},
		},
		// Thread 4: Q1 OKR Review — info, all team members
		{
			subject: "Q1 OKR Review - Results and Q2 Planning",
			messages: []struct {
				fromLocal string
				body      string
			}{
				{"info", `<p>Hi everyone,</p>
<p>Q1 is wrapping up and it's time to review our OKRs. Here's a summary of where we landed:</p>
<p><strong>Objective 1: Improve Platform Reliability</strong></p>
<ul>
<li>KR1: 99.95% uptime — <span style="color:green">Achieved (99.97%)</span></li>
<li>KR2: P1 MTTR under 30 min — <span style="color:orange">Partial (38 min avg)</span></li>
<li>KR3: Automated failover — <span style="color:green">Achieved</span></li>
</ul>
<p><strong>Objective 2: Scale Engineering Velocity</strong></p>
<ul>
<li>KR1: CI/CD pipeline time -40% — <span style="color:green">Achieved (-47%)</span></li>
<li>KR2: Test coverage 85% — <span style="color:red">Missed (78%)</span></li>
</ul>
<p>Please submit your Q2 OKR drafts by Friday. We'll review them in Monday's all-hands.</p>
<p>Acme Info</p>`},
				{"sarah.chen", `<p>Great progress on reliability! For Q2, I'd like to propose:</p>
<p><strong>Objective: Modernize Email Infrastructure</strong></p>
<ul>
<li>KR1: Complete JMAP integration for all mailbox operations</li>
<li>KR2: Launch new webmail UI to 50% of users</li>
<li>KR3: Reduce email processing latency by 60%</li>
</ul>
<p>This aligns with the infrastructure savings we're targeting.</p>
<p>Sarah</p>`},
				{"alex.rivera", `<p>For the platform team, I'm proposing:</p>
<p><strong>Objective: Zero-Downtime Deployments</strong></p>
<ul>
<li>KR1: All services support rolling updates</li>
<li>KR2: Canary deployment pipeline for critical services</li>
<li>KR3: Automated rollback on error rate spike</li>
</ul>
<p>This should also help with the MTTR target we missed in Q1.</p>
<p>Alex</p>`},
				{"emma.larsson", `<p>Product side Q2 goals:</p>
<p><strong>Objective: Improve User Satisfaction</strong></p>
<ul>
<li>KR1: NPS score > 40 (currently 31)</li>
<li>KR2: Reduce support ticket volume by 25%</li>
<li>KR3: Ship 3 most-requested features from user survey</li>
</ul>
<p>The top 3 requested features are: dark mode, keyboard shortcuts, and calendar integration.</p>
<p>Emma</p>`},
				{"marcus.johnson", `<p>Backend team Q2:</p>
<p><strong>Objective: API Platform Excellence</strong></p>
<ul>
<li>KR1: Launch API v3 with full documentation</li>
<li>KR2: 99th percentile latency under 200ms</li>
<li>KR3: Onboard 5 new API partners</li>
</ul>
<p>This builds on Sarah's migration plan. We should coordinate timelines.</p>
<p>Marcus</p>`},
			},
		},
		// Thread 5: New Hire Onboarding — sarah.chen, emma.larsson
		{
			subject: "New Hire Onboarding - Jordan Kim",
			messages: []struct {
				fromLocal string
				body      string
			}{
				{"sarah.chen", `<p>Hi Emma,</p>
<p>Jordan Kim is starting next Monday as a Junior Frontend Engineer on your team. Here's what I've set up so far:</p>
<ul>
<li>Laptop ordered (MacBook Pro 16") — arrives Thursday</li>
<li>GitHub, Slack, and Notion accounts created</li>
<li>First-week buddy: Priya (confirmed)</li>
</ul>
<p>Can you prepare the onboarding schedule? I'd suggest:</p>
<ul>
<li>Monday: Welcome, setup, team intros</li>
<li>Tuesday: Codebase walkthrough with buddy</li>
<li>Wednesday: First small task (good-first-issue)</li>
<li>Thursday-Friday: Pair programming sessions</li>
</ul>
<p>Sarah</p>`},
				{"emma.larsson", `<p>Thanks Sarah, this is really thorough!</p>
<p>I'll prepare the onboarding doc today. A few additions to the schedule:</p>
<ul>
<li>Monday 11am: 1:1 with me to discuss team goals and expectations</li>
<li>Tuesday 2pm: Product overview with the PM team</li>
<li>Wednesday: Join the daily standup (good way to meet everyone)</li>
</ul>
<p>For the good-first-issue, I'm thinking the dark mode toggle for the settings page — it's well-scoped and touches our component library.</p>
<p>Should we also schedule a 30-day check-in?</p>
<p>Emma</p>`},
				{"sarah.chen", `<p>The dark mode toggle is a perfect starter task!</p>
<p>Yes, let's schedule the 30-day check-in. I'll set it up for April 27.</p>
<p>One more thing — can you add Jordan to the #frontend and #new-hires Slack channels? I've already added them to #general and #engineering.</p>
<p>Looking forward to having them on the team!</p>
<p>Sarah</p>`},
			},
		},
	}

	var specs []emailSpec
	for _, conv := range conversations {
		baseDate := randomDate(14)
		var prevMessageID string
		var refs []string

		for j, msg := range conv.messages {
			msgDate := baseDate.Add(time.Duration(j*3+rand.Intn(4)) * time.Hour)
			messageID := fmt.Sprintf("<thread-%d-msg-%d@seed.local>", rand.Int63(), j)

			subject := conv.subject
			if j > 0 {
				subject = "Re: " + conv.subject
			}

			fromCol := findColleague(msg.fromLocal)
			fromEmail := colleagueEmail(fromCol)
			fromName := fromCol.Name

			// Determine mailbox: if this account sent the message, it goes to Sent;
			// otherwise it goes to Inbox.
			mailboxID := mb.Inbox
			if msg.fromLocal == acctLocal {
				mailboxID = mb.Sent
			}

			// Build the To header. For simplicity, address it to the next
			// participant in the thread (or the first if sender is last).
			toLocal := ""
			for _, m := range conv.messages {
				if m.fromLocal != msg.fromLocal {
					toLocal = m.fromLocal
					break
				}
			}
			if toLocal == "" {
				toLocal = conv.messages[0].fromLocal
			}
			toCol := findColleague(toLocal)
			toEmail := colleagueEmail(toCol)

			spec := emailSpec{
				From:      fromEmail,
				FromName:  fromName,
				To:        toEmail,
				Subject:   subject,
				HTMLBody:  wrapHTML(msg.body),
				Date:      msgDate,
				MailboxID: mailboxID,
				IsRead:    true,
				MessageID: messageID,
			}

			if prevMessageID != "" {
				spec.InReplyTo = prevMessageID
				spec.References = strings.Join(refs, " ")
			}

			specs = append(specs, spec)
			refs = append(refs, messageID)
			prevMessageID = messageID
		}
	}
	return specs
}

// ---- Standalone internal emails (not threaded) ----

func generateInternalSingles(acctEmail string, mb *mailboxes) []emailSpec {
	acctLocal := strings.SplitN(acctEmail, "@", 2)[0]

	type singleEmail struct {
		fromLocal string
		subject   string
		body      string
		isRead    bool
		isFlagged bool
	}

	emails := []singleEmail{
		{"sarah.chen", "Quick sync about the deployment?",
			`<p>Hey,</p><p>Can we hop on a quick call to discuss the deployment schedule for next week? I have some concerns about the database migration timing.</p><p>Free anytime this afternoon.</p><p>Sarah</p>`,
			false, false},
		{"marcus.johnson", "Code review feedback on PR #847",
			`<p>Hi,</p><p>I've reviewed PR #847 and left some comments. The overall approach looks solid, but I think we should discuss the caching strategy before merging.</p><p>Main concerns:</p><ul><li>Cache invalidation timing might cause stale reads</li><li>The TTL of 5 minutes seems too aggressive for user profiles</li></ul><p>Want to jump on a call?</p><p>Marcus</p>`,
			false, false},
		{"priya.patel", "Design handoff ready",
			`<p>Hi there!</p><p>The new dashboard mockups are finalized and ready for handoff. I've uploaded everything to Figma:</p><ul><li>Desktop layouts (1440px, 1920px)</li><li>Tablet responsive views</li><li>Component specifications</li></ul><p>Let me know if you want to walk through them together.</p><p>Priya</p>`,
			false, false},
		{"alex.rivera", "Staging environment issue",
			`<p>Hey,</p><p>I noticed the staging environment is throwing 502 errors intermittently. I've checked the logs and it seems like a memory issue with the JMAP worker process.</p><p>Can you take a look when you get a chance? The error pattern starts around 10am when the batch jobs kick in.</p><p>Alex</p>`,
			false, false},
		{"emma.larsson", "Sprint retrospective action items",
			`<p>Hi team,</p><p>Here are the action items from today's retro:</p><ol><li>Improve PR review turnaround time (target: &lt;24h)</li><li>Set up automated staging deploys via CI</li><li>Document the API versioning strategy</li></ol><p>I've created Jira tickets for each. Let's discuss priorities in our next standup.</p><p>Emma</p>`,
			true, false},
		{"info", "March All-Hands Meeting - Agenda",
			`<p>Hi everyone,</p><p>Here's the agenda for this month's all-hands meeting (Friday 3pm):</p><ol><li>Q1 results overview (CEO)</li><li>Product roadmap update (Emma)</li><li>Engineering highlights (Sarah)</li><li>New hire introductions</li><li>Q&amp;A</li></ol><p>Please submit questions in advance via the #all-hands Slack channel.</p><p>Acme Info</p>`,
			true, false},
		{"support", "Updated support rotation for April",
			`<p>Hi team,</p><p>The April on-call rotation is now published. Key changes:</p><ul><li>We're moving to 1-week rotations (from 2-week)</li><li>Added a secondary on-call role for backup</li><li>Weekend coverage now has a separate rotation</li></ul><p>Check the schedule in PagerDuty and swap shifts by March 28 if needed.</p><p>Acme Support</p>`,
			true, false},
		{"marcus.johnson", "Lunch today?",
			`<p>Hey, want to grab lunch today? I was thinking the new ramen place on 5th street. Emma and Alex are coming too.</p><p>12:30 work for you?</p><p>Marcus</p>`,
			false, false},
		{"sarah.chen", "FYI: Production metrics dashboard",
			`<p>Hey,</p><p>I set up a new Grafana dashboard for our production metrics. It includes:</p><ul><li>Request latency (p50, p95, p99)</li><li>Error rates by endpoint</li><li>Active connections</li><li>Queue depth</li></ul><p>Link: <a href="https://grafana.internal/d/prod-overview">Production Overview</a></p><p>Feedback welcome!</p><p>Sarah</p>`,
			true, true},
		{"priya.patel", "Brand guidelines updated",
			`<p>Hi all,</p><p>I've updated our brand guidelines with the new color palette and typography. Key changes:</p><ul><li>Primary blue shifted slightly: #2563eb &rarr; #2557d6</li><li>New font stack: Inter for UI, Source Serif for marketing</li><li>Updated icon set (Lucide replacing Feather)</li></ul><p>Please use the updated Figma library going forward.</p><p>Priya</p>`,
			true, false},
		{"alex.rivera", "SSL certs expiring next week",
			`<p>Heads up — the wildcard SSL cert for *.acme.customer.mhst.io expires next Thursday.</p><p>I've already submitted the renewal request. Auto-renewal failed because the DNS challenge record was stale. I've fixed the automation so this won't happen again.</p><p>No action needed from your side, just FYI.</p><p>Alex</p>`,
			false, true},
		{"emma.larsson", "User research insights - email compose flow",
			`<p>Hi team,</p><p>Just wrapped up the user research sessions on the email compose flow. Key findings:</p><ol><li>Users want autocomplete for internal recipients (top request)</li><li>The attachment flow is confusing on mobile</li><li>Rich text formatting toolbar needs better discoverability</li><li>Users love the quick-reply feature</li></ol><p>Full report is in the Research folder on Notion. Let's discuss in next week's design review.</p><p>Emma</p>`,
			false, false},
		{"sarah.chen", "Important: Server credentials for staging",
			`<p>Here are the updated credentials for the staging environment. Please store them securely.</p><p><strong>Host:</strong> staging.internal.acme.io<br><strong>Port:</strong> 5432<br><strong>Database:</strong> webmail_staging</p><p>These rotate every 30 days. Next rotation: April 15.</p><p>Sarah</p>`,
			true, true},
		{"marcus.johnson", "Architecture decision: JMAP as primary protocol",
			`<p>Summary of today's architecture review:</p><p><strong>Decision:</strong> We'll go with JMAP as the primary protocol for the new webmail client.</p><p><strong>Rationale:</strong></p><ul><li>Better performance than IMAP for web clients</li><li>Built-in push support via EventSource</li><li>Cleaner API with proper state management</li><li>Easier to implement offline support</li></ul><p><strong>Timeline:</strong> MVP by end of Q2.</p><p>ADR document: <a href="https://notion.so/adr-003">ADR-003</a></p><p>Marcus</p>`,
			true, true},
		{"info", "Welcome Jordan Kim to the team!",
			`<p>Hi everyone,</p><p>Please join me in welcoming <strong>Jordan Kim</strong> who starts next Monday as a Junior Frontend Engineer!</p><p>Jordan comes from a bootcamp background with strong React and TypeScript skills. They'll be joining Emma's product team.</p><p>Their buddy for the first month will be Priya. Please make them feel welcome!</p><p>Acme Info</p>`,
			true, false},
	}

	var specs []emailSpec
	for _, e := range emails {
		if e.fromLocal == acctLocal {
			continue // skip emails from self
		}
		fromCol := findColleague(e.fromLocal)
		specs = append(specs, emailSpec{
			From:      colleagueEmail(fromCol),
			FromName:  fromCol.Name,
			To:        acctEmail,
			Subject:   e.subject,
			HTMLBody:  wrapHTML(e.body),
			Date:      randomDate(7),
			MailboxID: mb.Inbox,
			IsRead:    e.isRead,
			IsFlagged: e.isFlagged,
		})
	}
	return specs
}

// ---- Sent emails (from this account to colleagues) ----

func generateSentEmails(acctEmail string, mb *mailboxes) []emailSpec {
	acctLocal := strings.SplitN(acctEmail, "@", 2)[0]

	sentEmails := []struct {
		toLocal string
		subject string
		body    string
	}{
		{"sarah.chen", "Re: Quick sync about the deployment?",
			`<p>Hey Sarah,</p><p>Sure, I'm free after 2pm. Let's do a quick video call.</p><p>I also looked at the migration scripts — we should probably run them in a maintenance window. Saturday 6am?</p><p>Talk soon.</p>`},
		{"marcus.johnson", "Re: Code review feedback on PR #847",
			`<p>Thanks for the review, Marcus. Good catch on the TTL — I'll bump it to 15 minutes and add an invalidation hook for profile updates.</p><p>Updated the PR, mind taking another look?</p>`},
		{"alex.rivera", "Deployment checklist for Friday",
			`<p>Alex,</p><p>Here's the checklist for Friday's release:</p><ol><li>Run full regression suite</li><li>Update API documentation</li><li>Notify beta customers</li><li>Stage the deployment at 2pm</li><li>Go live at 4pm (low traffic window)</li></ol><p>Please confirm you've reviewed the infra section.</p>`},
		{"priya.patel", "Feedback on dashboard designs",
			`<p>Hey Priya,</p><p>Reviewed the latest mockups. Overall they look great! A few suggestions:</p><ul><li>The sidebar feels a bit cramped on 1366px screens</li><li>Love the new color scheme for charts</li><li>Can we add a "last updated" timestamp to each widget?</li></ul><p>Happy to jump on a call to discuss.</p>`},
		{"emma.larsson", "Re: Sprint retrospective action items",
			`<p>Thanks Emma. I'll take ownership of the API versioning documentation — should have a first draft by Wednesday.</p><p>For the PR review turnaround, maybe we should set up a Slack reminder in #engineering when PRs are pending for more than 12 hours?</p>`},
		{"info", "Conference budget request for Q2",
			`<p>Hi,</p><p>I'd like to request budget for attending GopherCon EU in June. Estimated costs:</p><ul><li>Conference ticket: $800</li><li>Travel: $500</li><li>Hotel (3 nights): $600</li></ul><p>I'm planning to give a talk on our JMAP migration if accepted. Happy to share learnings with the team after.</p><p>Thanks!</p>`},
	}

	var specs []emailSpec
	for _, se := range sentEmails {
		if se.toLocal == acctLocal {
			continue
		}
		toCol := findColleague(se.toLocal)
		specs = append(specs, emailSpec{
			From:      acctEmail,
			FromName:  "",
			To:        fmt.Sprintf("%s <%s>", toCol.Name, colleagueEmail(toCol)),
			Subject:   se.subject,
			HTMLBody:  wrapHTML(se.body),
			Date:      randomDate(10),
			MailboxID: mb.Sent,
			IsRead:    true,
		})
	}
	return specs
}

// ---- External emails (newsletters, notifications, etc.) ----

func generateExternalEmails(acctEmail string, mb *mailboxes) []emailSpec {
	externals := []struct {
		from     sender
		subject  string
		body     string
		isRead   bool
		mailbox  string // "inbox", "junk", "trash"
		isFlagged bool
	}{
		{sender{"Go Weekly", "newsletter@golangweekly.com"}, "Go Weekly #412 - Generics Deep Dive",
			`<h2>Go Weekly</h2>
<p>Your weekly dose of Go programming news and tutorials.</p>
<p><strong>Featured Article:</strong> Understanding Go's new range-over-func feature and how it changes iteration patterns.</p>
<ul><li>Optimizing memory allocations in hot paths</li><li>Building resilient microservices with Go</li><li>New testing patterns for table-driven tests</li></ul>`,
			true, "inbox", false},
		{sender{"GitHub", "noreply@github.com"}, "[acme/webmail] PR #892 merged: Add calendar integration",
			`<p><strong>Pull request #892</strong> has been merged into <code>main</code>.</p>
<p><strong>Add calendar integration</strong> by @sarah-chen</p>
<p>+1,247 -89 across 23 files</p>
<p>Reviewers: @marcus-j, @alex-r (approved)</p>`,
			true, "inbox", false},
		{sender{"Jira", "jira@atlassian.com"}, "[WEBMAIL-142] Launch checklist - assigned to you",
			`<p><strong>WEBMAIL-142: Launch Checklist for Webmail v2</strong></p>
<p>Priority: <span style="color: #d32f2f;">Critical</span><br>Sprint: Sprint 24<br>Due: March 31, 2026</p>
<p>Checklist:<br>- [ ] Load testing complete<br>- [ ] Security audit passed<br>- [ ] Documentation updated<br>- [ ] Rollback plan documented</p>`,
			false, "inbox", true},
		{sender{"AWS", "no-reply@aws.amazon.com"}, "AWS Cost Alert: March spend approaching budget",
			`<p><strong>AWS Cost Alert</strong></p>
<p>Your account <code>acme-production</code> has reached 82% of the monthly budget.</p>
<table style="border-collapse: collapse; width: 100%;"><tr style="background: #f3f4f6;"><td style="padding: 8px; border: 1px solid #e5e7eb;"><strong>Service</strong></td><td style="padding: 8px; border: 1px solid #e5e7eb;"><strong>Cost</strong></td></tr>
<tr><td style="padding: 8px; border: 1px solid #e5e7eb;">EC2</td><td style="padding: 8px; border: 1px solid #e5e7eb;">$2,847</td></tr>
<tr><td style="padding: 8px; border: 1px solid #e5e7eb;">RDS</td><td style="padding: 8px; border: 1px solid #e5e7eb;">$1,234</td></tr>
<tr><td style="padding: 8px; border: 1px solid #e5e7eb;">S3</td><td style="padding: 8px; border: 1px solid #e5e7eb;">$156</td></tr></table>`,
			false, "inbox", false},
		{sender{"The Pragmatic Engineer", "gergely@pragmaticengineer.com"}, "Compensation Trends in 2026",
			`<h2>The Pragmatic Engineer</h2>
<p>We surveyed 5,000 engineers across 40 countries. Here are the surprising results.</p>
<p>Key takeaway: Remote roles are seeing <em>increased</em> compensation in specialized areas like platform engineering and ML infrastructure.</p>`,
			true, "inbox", false},
		{sender{"Billing", "billing@cloudservices.com"}, "Your Invoice #INV-2026-0342",
			`<p>Dear Customer,</p>
<p>Please find your invoice for the billing period March 1-31, 2026.</p>
<p><strong>Total: $915.70</strong></p><p>Payment is due within 30 days.</p>`,
			true, "inbox", false},
		// Junk
		{sender{"International Lottery Commission", "winner@lottery-intl.xyz"}, "CONGRATULATIONS! You've Won $5,000,000!!!",
			`<p style="color: red; font-size: 18px;"><strong>YOU ARE A WINNER!!!</strong></p>
<p>Your email was selected in our INTERNATIONAL MEGA LOTTERY DRAW. You have won <strong>$5,000,000.00 USD</strong>!!!</p>
<p>To claim your prize, send your full name, address, and bank details IMMEDIATELY.</p>`,
			false, "junk", false},
		{sender{"Online Pharmacy", "deals@cheapmeds-online.ru"}, "70% OFF - Limited Time Offer",
			`<p>BEST DEALS ONLINE - UP TO 70% OFF</p><p>Click here for amazing discounts!</p>
<p>FREE SHIPPING on all orders over $50!</p>`,
			false, "junk", false},
		// Trash
		{sender{"Example Service", "noreply@service.example.com"}, "Your password has been changed",
			`<p>This is a confirmation that your password was successfully changed on March 10, 2026.</p>
<p>If you didn't make this change, please contact support immediately.</p>`,
			true, "trash", false},
		{sender{"Old Newsletter", "newsletter@oldservice.com"}, "Weekly Update #283",
			`<p>This week's update from Old Service...</p>
<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>`,
			true, "trash", false},
	}

	var specs []emailSpec
	for _, e := range externals {
		mailboxID := mb.Inbox
		switch e.mailbox {
		case "junk":
			mailboxID = mb.Junk
		case "trash":
			mailboxID = mb.Trash
		}
		specs = append(specs, emailSpec{
			From:      e.from.Email,
			FromName:  e.from.Name,
			To:        acctEmail,
			Subject:   e.subject,
			HTMLBody:  wrapHTML(e.body),
			Date:      randomDate(14),
			MailboxID: mailboxID,
			IsRead:    e.isRead,
			IsFlagged: e.isFlagged,
		})
	}
	return specs
}

// ---- Attachment emails (from colleagues) ----

func generateAttachmentEmails(acctEmail string, mb *mailboxes) []emailSpec {
	acctLocal := strings.SplitN(acctEmail, "@", 2)[0]

	attachmentEmails := []struct {
		fromLocal   string
		subject     string
		body        string
		attachments []attachmentSpec
	}{
		{"sarah.chen", "Q4 Budget Review - Final",
			`<p>Hi,</p>
<p>Please find attached the final Q4 budget review documents.</p>
<p>Key highlights:</p>
<ul><li>Total spend: $2.4M (5% under budget)</li><li>Infrastructure costs down 12% after cloud optimization</li><li>Headcount costs as projected</li></ul>
<p>Let me know if you have questions before the board meeting.</p>
<p>Sarah</p>`,
			[]attachmentSpec{
				{Filename: "Q4_Budget_2025.xlsx", ContentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"},
				{Filename: "Budget_Summary.pdf", ContentType: "application/pdf"},
			}},
		{"priya.patel", "Design Mockups v3",
			`<p>Hey team,</p>
<p>Updated mockups incorporating last week's feedback:</p>
<ul><li>Simplified navigation sidebar</li><li>New color palette for data visualizations</li><li>Mobile responsive layouts</li></ul>
<p>The Figma file has all the components.</p>
<p>Priya</p>`,
			[]attachmentSpec{
				{Filename: "Dashboard_Redesign_v3.png", ContentType: "image/png"},
				{Filename: "Mobile_Views.png", ContentType: "image/png"},
				{Filename: "Component_Library.fig", ContentType: "application/octet-stream"},
			}},
		{"marcus.johnson", "Meeting Notes - Sprint Retrospective",
			`<p>Team,</p>
<p>Notes from today's retro attached. Summary of action items:</p>
<ol><li>Improve test coverage for auth module (assigned: Alex)</li><li>Set up automated deployment to staging (assigned: Marcus)</li><li>Document API versioning strategy (assigned: Sarah)</li></ol>
<p>Great sprint everyone!</p>
<p>Marcus</p>`,
			[]attachmentSpec{
				{Filename: "Sprint_23_Retro_Notes.md", ContentType: "text/markdown"},
			}},
		{"alex.rivera", "Infrastructure cost report",
			`<p>Hey,</p>
<p>Here's the monthly infrastructure cost report. We managed to cut costs by 12% this month thanks to the reserved instance purchases and right-sizing effort.</p>
<p>See the attached spreadsheet for the full breakdown by service.</p>
<p>Alex</p>`,
			[]attachmentSpec{
				{Filename: "Infra_Cost_Report_March_2026.xlsx", ContentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"},
			}},
		{"emma.larsson", "User Research Report - Q1",
			`<p>Hi all,</p>
<p>Attached is the Q1 user research report. We interviewed 24 users and identified 5 major pain points.</p>
<p>Top finding: users want faster search and better keyboard shortcuts. Full details in the PDF.</p>
<p>Emma</p>`,
			[]attachmentSpec{
				{Filename: "Q1_User_Research_Report.pdf", ContentType: "application/pdf"},
				{Filename: "Interview_Notes_Raw.xlsx", ContentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"},
			}},
	}

	var specs []emailSpec
	for _, ae := range attachmentEmails {
		if ae.fromLocal == acctLocal {
			continue
		}
		fromCol := findColleague(ae.fromLocal)
		specs = append(specs, emailSpec{
			From:        colleagueEmail(fromCol),
			FromName:    fromCol.Name,
			To:          acctEmail,
			Subject:     ae.subject,
			HTMLBody:    wrapHTML(ae.body),
			Date:        randomDate(20),
			MailboxID:   mb.Inbox,
			IsRead:      rand.Float32() < 0.6,
			Attachments: ae.attachments,
		})
	}
	return specs
}

// ---- Draft emails ----

func generateDraftEmails(acctEmail string, mb *mailboxes) []emailSpec {
	acctLocal := strings.SplitN(acctEmail, "@", 2)[0]

	drafts := []struct {
		toLocal string
		subject string
		body    string
	}{
		{"marcus.johnson", "RFC: New Caching Strategy",
			`<p>Marcus,</p>
<p>I've been thinking about our caching approach and wanted to propose some changes:</p>
<p><strong>Current issues:</strong></p>
<ul><li>Cache invalidation is inconsistent across services</li><li>TTLs are too aggressive for static content</li></ul>
<p><strong>Proposed changes:</strong></p>
<p>[TODO: flesh this out with benchmarks]</p>`},
		{"sarah.chen", "1:1 Agenda Items",
			`<p>Topics for our next 1:1:</p>
<ul><li>Career growth discussion</li><li>Team hiring priorities for Q2</li><li>Conference budget for GopherCon EU</li></ul>`},
		{"", "Blog Post Draft - JMAP Migration Story",
			`<p><em>Draft - Work in Progress</em></p>
<h1>How We Migrated Our Email Platform to JMAP</h1>
<p>When we started evaluating email protocols for our next-generation webmail client, we knew IMAP wasn't going to cut it anymore...</p>
<p>[Continue writing]</p>`},
	}

	var specs []emailSpec
	for _, d := range drafts {
		to := ""
		if d.toLocal != "" && d.toLocal != acctLocal {
			toCol := findColleague(d.toLocal)
			to = fmt.Sprintf("%s <%s>", toCol.Name, colleagueEmail(toCol))
		}
		specs = append(specs, emailSpec{
			From:      acctEmail,
			FromName:  "",
			To:        to,
			Subject:   d.subject,
			HTMLBody:  wrapHTML(d.body),
			Date:      randomDate(5),
			MailboxID: mb.Drafts,
			IsRead:    true,
			IsDraft:   true,
		})
	}
	return specs
}

// --- Seed function ---

func seedAccount(baseURL, webmailURL string, acct account, clean bool) error {
	fmt.Printf("Seeding %s...\n", acct.Email)

	c := newClient(baseURL, webmailURL, acct.Email, acct.Password)
	if err := c.fetchSession(); err != nil {
		return fmt.Errorf("fetching session for %s: %w", acct.Email, err)
	}

	mb, err := c.getMailboxes()
	if err != nil {
		return fmt.Errorf("getting mailboxes: %w", err)
	}

	if clean {
		fmt.Println("  Cleaning existing data...")
		if err := c.cleanEmails(); err != nil {
			return fmt.Errorf("cleaning emails: %w", err)
		}
		if err := c.cleanContacts(); err != nil {
			fmt.Printf("  Warning: could not clean contacts: %v\n", err)
		}
		if err := c.cleanCalendarEvents(); err != nil {
			fmt.Printf("  Warning: could not clean calendar: %v\n", err)
		}
	}

	// Collect all emails
	var allEmails []emailSpec

	// 1. Internal threaded conversations (the bulk — 5 threads, ~20 messages)
	allEmails = append(allEmails, generateInternalThreads(acct.Email, mb)...)

	// 2. Internal single emails (~15 messages from colleagues)
	allEmails = append(allEmails, generateInternalSingles(acct.Email, mb)...)

	// 3. Sent emails to colleagues (~6)
	allEmails = append(allEmails, generateSentEmails(acct.Email, mb)...)

	// 4. Attachment emails from colleagues (~5)
	allEmails = append(allEmails, generateAttachmentEmails(acct.Email, mb)...)

	// 5. Draft emails (~3)
	allEmails = append(allEmails, generateDraftEmails(acct.Email, mb)...)

	// 6. External emails (newsletters, notifications, junk, trash — ~10)
	allEmails = append(allEmails, generateExternalEmails(acct.Email, mb)...)

	// Import all emails
	var unread, starred int
	for i, spec := range allEmails {
		if err := c.importEmail(spec); err != nil {
			return fmt.Errorf("importing email %d (%s): %w", i+1, spec.Subject, err)
		}
		if !spec.IsRead {
			unread++
		}
		if spec.IsFlagged {
			starred++
		}
	}

	fmt.Printf("  Created %d emails (%d unread, %d starred)\n", len(allEmails), unread, starred)

	// --- Contacts ---
	if c.hasCapability("urn:ietf:params:jmap:contacts") {
		contactCount, err := seedContacts(c, acct.Email)
		if err != nil {
			fmt.Printf("  Contacts: skipped (error: %v)\n", err)
		} else {
			fmt.Printf("  Created %d contacts\n", contactCount)
		}
	} else {
		fmt.Println("  Contacts: skipped (capability not available)")
	}

	// --- Calendar ---
	if c.hasCapability("urn:ietf:params:jmap:calendars") {
		eventCount, err := seedCalendarEvents(c, acct.Email)
		if err != nil {
			fmt.Printf("  Calendar: skipped (error: %v)\n", err)
		} else {
			fmt.Printf("  Created %d calendar events\n", eventCount)
		}
	} else {
		fmt.Println("  Calendar: skipped (capability not available)")
	}

	return nil
}

// --- Contacts ---

type contactCard struct {
	Name          map[string]interface{} `json:"name,omitempty"`
	Emails        map[string]interface{} `json:"emails,omitempty"`
	Phones        map[string]interface{} `json:"phones,omitempty"`
	Organizations map[string]interface{} `json:"organizations,omitempty"`
	Titles        map[string]interface{} `json:"titles,omitempty"`
	Addresses     map[string]interface{} `json:"addresses,omitempty"`
	Notes         string                 `json:"notes,omitempty"`
}

func getDefaultAddressBookID(c *client) (string, error) {
	resp, err := c.jmapCall(jmapRequest{
		Using: []string{"urn:ietf:params:jmap:contacts"},
		MethodCalls: [][]interface{}{
			{"AddressBook/get", map[string]interface{}{
				"accountId":  c.accountID,
				"properties": []string{"id", "isDefault"},
			}, "0"},
		},
	})
	if err != nil {
		return "", err
	}
	var result struct {
		List []struct {
			ID        string `json:"id"`
			IsDefault bool   `json:"isDefault"`
		} `json:"list"`
	}
	if err := json.Unmarshal(resp.MethodResponses[0][1], &result); err != nil {
		return "", err
	}
	for _, ab := range result.List {
		if ab.IsDefault {
			return ab.ID, nil
		}
	}
	if len(result.List) > 0 {
		return result.List[0].ID, nil
	}
	return "", fmt.Errorf("no address book found")
}

func seedContacts(c *client, acctEmail string) (int, error) {
	addressBookID, err := getDefaultAddressBookID(c)
	if err != nil {
		return 0, fmt.Errorf("getting default address book: %w", err)
	}

	acctLocal := strings.SplitN(acctEmail, "@", 2)[0]

	type contactDef struct {
		fullName string
		emails   []string
		phone    string
		org      string
		title    string
		notes    string
	}

	var contacts []contactDef

	// Internal colleagues (all acme accounts except self)
	internalContacts := []struct {
		local string
		name  string
		title string
		phone string
	}{
		{"info", "Acme Info", "Company Announcements", "+1-800-555-0100"},
		{"support", "Acme Support", "Customer Support", "+1-800-555-0101"},
		{"sarah.chen", "Sarah Chen", "VP of Engineering", "+1-415-555-0102"},
		{"marcus.johnson", "Marcus Johnson", "Senior Backend Engineer", "+1-212-555-0103"},
		{"priya.patel", "Priya Patel", "Lead Designer", "+1-650-555-0104"},
		{"alex.rivera", "Alex Rivera", "DevOps Lead", "+1-650-555-0105"},
		{"emma.larsson", "Emma Larsson", "Product Manager", "+46-8-555-0106"},
	}

	for _, ic := range internalContacts {
		if ic.local == acctLocal {
			continue
		}
		contacts = append(contacts, contactDef{
			fullName: ic.name,
			emails:   []string{ic.local + "@" + domain},
			phone:    ic.phone,
			org:      "Acme",
			title:    ic.title,
			notes:    "Internal colleague",
		})
	}

	// External contacts (~20)
	externalContacts := []contactDef{
		{"Maria Garcia", []string{"maria@techlatam.mx"}, "+52-55-555-0111", "TechLatam", "Engineering Manager", ""},
		{"Oleksandr Kovalenko", []string{"oleks@kyivcode.ua"}, "+380-44-555-0112", "KyivCode", "Backend Developer", "Go and Rust expert"},
		{"Aisha Okafor", []string{"aisha@lagostech.ng"}, "+234-1-555-0113", "LagosTech", "Data Scientist", ""},
		{"Pierre Dubois", []string{"pierre@parisdev.fr", "p.dubois@personal.fr"}, "+33-1-555-0114", "ParisDev", "Frontend Lead", "Vue.js contributor"},
		{"Raj Krishnan", []string{"raj@bangaloresoft.in"}, "+91-80-555-0115", "BangaloreSoft", "Tech Lead", "AWS certified"},
		{"Sophie Mueller", []string{"sophie@berlintech.de"}, "+49-30-555-0116", "BerlinTech", "QA Lead", ""},
		{"Carlos Mendez", []string{"carlos@saotechworks.br"}, "+55-11-555-0117", "SaoTechWorks", "Full Stack Developer", "Organizes local meetups"},
		{"Yuki Tanaka", []string{"yuki@tokyodev.jp"}, "+81-3-5555-0106", "TokyoDev", "CTO", ""},
		{"David Kim", []string{"david.kim@startuphq.com"}, "+1-310-555-0107", "StartupHQ", "CEO", "YC W24 batch"},
		{"Fatima Al-Hassan", []string{"fatima@menadigital.ae"}, "+971-4-555-0108", "MENA Digital", "Regional Director", ""},
		{"James O'Brien", []string{"james@dublinsoft.ie"}, "+353-1-555-0109", "Dublin Software", "Solutions Architect", ""},
		{"Lin Wei", []string{"lin.wei@shenzhenai.cn"}, "+86-755-555-0110", "Shenzhen AI", "ML Engineer", "PhD from Tsinghua"},
		{"Hassan Ali", []string{"hassan@cairotech.eg"}, "+20-2-555-0119", "CairoTech", "Mobile Developer", "Flutter specialist"},
		{"Ingrid Johansson", []string{"ingrid@osloinnovate.no"}, "+47-22-555-0120", "Oslo Innovate", "UX Researcher", ""},
		{"Chen Wei Ming", []string{"weiming@shanghaistartup.cn"}, "+86-21-555-0121", "Shanghai Startup", "Co-founder", ""},
		{"Ana Popescu", []string{"ana@bucharestdev.ro"}, "+40-21-555-0122", "BucharestDev", "Database Admin", "PostgreSQL expert"},
		{"Tom Wilson", []string{"tom.wilson@partner-corp.com"}, "+1-800-555-0123", "Partner Corp", "Account Manager", "Key partner contact"},
		{"Lisa Park", []string{"lisa.park@recruiter.io"}, "+1-800-555-0124", "TalentSearch", "Senior Recruiter", ""},
		{"Mike Thompson", []string{"mike@freelance.dev"}, "+1-503-555-0125", "", "Freelance Consultant", "Available for contract work"},
		{"Grace Mwangi", []string{"grace@nairobitech.ke"}, "+254-20-555-0130", "NairobiTech", "iOS Developer", "Swift and SwiftUI"},
	}
	contacts = append(contacts, externalContacts...)

	create := map[string]interface{}{}
	for i, ct := range contacts {
		card := map[string]interface{}{}

		// Name (JSContact format)
		parts := strings.SplitN(ct.fullName, " ", 2)
		given := parts[0]
		surname := ""
		if len(parts) > 1 {
			surname = parts[1]
		}
		card["name"] = map[string]interface{}{
			"components": []map[string]interface{}{
				{"kind": "given", "value": given},
				{"kind": "surname", "value": surname},
			},
		}

		// Emails
		emails := map[string]interface{}{}
		for j, email := range ct.emails {
			label := "work"
			if j > 0 {
				label = "personal"
			}
			emails[fmt.Sprintf("e%d", j)] = map[string]interface{}{
				"address":  email,
				"contexts": map[string]bool{label: true},
			}
		}
		card["emails"] = emails

		// Phones
		if ct.phone != "" {
			card["phones"] = map[string]interface{}{
				"p0": map[string]interface{}{
					"number":   ct.phone,
					"contexts": map[string]bool{"work": true},
				},
			}
		}

		// Organizations
		if ct.org != "" {
			card["organizations"] = map[string]interface{}{
				"o0": map[string]interface{}{
					"name": ct.org,
				},
			}
		}

		// Titles
		if ct.title != "" {
			card["titles"] = map[string]interface{}{
				"t0": map[string]interface{}{
					"name": ct.title,
				},
			}
		}

		// Notes
		if ct.notes != "" {
			card["notes"] = map[string]interface{}{
				"n0": map[string]interface{}{
					"note": ct.notes,
				},
			}
		}

		card["addressBookIds"] = map[string]bool{addressBookID: true}
		create[fmt.Sprintf("c%d", i)] = card
	}

	// Split into batches of 10
	keys := make([]string, 0, len(create))
	for k := range create {
		keys = append(keys, k)
	}

	total := 0
	batchSize := 10
	for i := 0; i < len(keys); i += batchSize {
		end := i + batchSize
		if end > len(keys) {
			end = len(keys)
		}
		batch := map[string]interface{}{}
		for _, k := range keys[i:end] {
			batch[k] = create[k]
		}

		_, err := c.jmapCall(jmapRequest{
			Using: []string{"urn:ietf:params:jmap:contacts"},
			MethodCalls: [][]interface{}{
				{"ContactCard/set", map[string]interface{}{
					"accountId": c.accountID,
					"create":    batch,
				}, "0"},
			},
		})
		if err != nil {
			return total, fmt.Errorf("creating contacts batch: %w", err)
		}
		total += len(batch)
	}

	return total, nil
}

// --- Calendar ---

func mondayOfCurrentWeek() time.Time {
	now := time.Now()
	monday := now
	for monday.Weekday() != time.Monday {
		monday = monday.AddDate(0, 0, -1)
	}
	return time.Date(monday.Year(), monday.Month(), monday.Day(), 0, 0, 0, 0, now.Location())
}

// participantsFromLocals builds a JMAP participants map from a list of local parts.
// The first local in the list is the organizer.
func participantsFromLocals(locals []string) map[string]interface{} {
	participants := map[string]interface{}{}
	for i, local := range locals {
		col := findColleague(local)
		roles := map[string]bool{"attendee": true}
		if i == 0 {
			roles["owner"] = true
		}
		participants[fmt.Sprintf("p%d", i)] = map[string]interface{}{
			"name":  col.Name,
			"email": colleagueEmail(col),
			"kind":  "individual",
			"roles": roles,
		}
	}
	return participants
}

func seedCalendarEvents(c *client, acctEmail string) (int, error) {
	// First, get the default calendar
	resp, err := c.jmapCall(jmapRequest{
		Using: []string{"urn:ietf:params:jmap:calendars"},
		MethodCalls: [][]interface{}{
			{"Calendar/get", map[string]interface{}{
				"accountId":  c.accountID,
				"properties": []string{"id", "name", "isDefault"},
			}, "0"},
		},
	})
	if err != nil {
		return 0, fmt.Errorf("getting calendars: %w", err)
	}

	var calResult struct {
		List []struct {
			ID        string `json:"id"`
			Name      string `json:"name"`
			IsDefault bool   `json:"isDefault"`
		} `json:"list"`
	}
	if err := json.Unmarshal(resp.MethodResponses[0][1], &calResult); err != nil {
		return 0, fmt.Errorf("decoding calendars: %w", err)
	}

	calendarID := ""
	for _, cal := range calResult.List {
		if cal.IsDefault {
			calendarID = cal.ID
			break
		}
	}
	if calendarID == "" && len(calResult.List) > 0 {
		calendarID = calResult.List[0].ID
	}
	if calendarID == "" {
		return 0, fmt.Errorf("no calendar found")
	}

	monday := mondayOfCurrentWeek()

	events := map[string]interface{}{}
	eventIdx := 0

	addEvent := func(key string, title, description, duration string, start time.Time, participants map[string]interface{}, showWithoutTime bool) {
		evt := map[string]interface{}{
			"calendarIds": map[string]bool{calendarID: true},
			"title":       title,
			"description": description,
			"start":       start.Format("2006-01-02T15:04:05"),
			"duration":    duration,
			"timeZone":    "Europe/Stockholm",
			"status":      "confirmed",
		}
		if participants != nil {
			evt["participants"] = participants
		}
		if showWithoutTime {
			evt["showWithoutTime"] = true
		}
		events[key] = evt
		eventIdx++
	}

	// ==================== CURRENT WEEK (Mon-Fri) ====================

	// --- Monday ---
	// 9:00 Daily Standup (15min) [wave-meeting]
	addEvent("mon-standup", "Daily Standup",
		"Quick sync on progress, blockers, and plans for the day.\n\n[wave-meeting]",
		"PT15M", monday.Add(9*time.Hour),
		participantsFromLocals([]string{"sarah.chen", "marcus.johnson", "alex.rivera", "emma.larsson"}), false)

	// 10:00 Sprint Planning (1h)
	addEvent("mon-sprint", "Sprint Planning",
		"Plan stories and tasks for Sprint 25. Bring your estimates and priorities.",
		"PT1H", monday.Add(10*time.Hour),
		participantsFromLocals([]string{"emma.larsson", "sarah.chen", "marcus.johnson", "priya.patel"}), false)

	// 14:00 Design Review (45min)
	addEvent("mon-design", "Design Review",
		"Review the latest UI mockups and discuss feedback from user testing.",
		"PT45M", monday.Add(14*time.Hour),
		participantsFromLocals([]string{"priya.patel", "emma.larsson", "sarah.chen"}), false)

	// --- Tuesday ---
	tue := monday.AddDate(0, 0, 1)

	// 9:00 Standup [wave-meeting]
	addEvent("tue-standup", "Daily Standup",
		"Quick sync on progress, blockers, and plans for the day.\n\n[wave-meeting]",
		"PT15M", tue.Add(9*time.Hour),
		participantsFromLocals([]string{"sarah.chen", "marcus.johnson", "alex.rivera", "emma.larsson"}), false)

	// 10:30 1:1 with Manager (30min) [wave-meeting]
	addEvent("tue-1on1", "1:1 with Manager",
		"Weekly check-in. Topics: career growth, project updates, team feedback.\n\n[wave-meeting]",
		"PT30M", tue.Add(10*time.Hour+30*time.Minute),
		participantsFromLocals([]string{"sarah.chen", "marcus.johnson"}), false)

	// 13:00 Architecture Review (1h)
	addEvent("tue-arch", "Architecture Review",
		"Discuss the proposed API v3 migration and data layer changes.",
		"PT1H", tue.Add(13*time.Hour),
		participantsFromLocals([]string{"marcus.johnson", "sarah.chen", "alex.rivera"}), false)

	// 15:00 Tech Talk (45min) [wave-meeting]
	addEvent("tue-techtalk", "Tech Talk: JMAP Protocol Deep Dive",
		"Internal presentation on JMAP and how it compares to IMAP. Presented by Marcus.\n\n[wave-meeting]",
		"PT45M", tue.Add(15*time.Hour),
		participantsFromLocals([]string{"marcus.johnson", "sarah.chen", "alex.rivera", "priya.patel"}), false)

	// --- Wednesday ---
	wed := monday.AddDate(0, 0, 2)

	// 9:00 Standup [wave-meeting]
	addEvent("wed-standup", "Daily Standup",
		"Quick sync on progress, blockers, and plans for the day.\n\n[wave-meeting]",
		"PT15M", wed.Add(9*time.Hour),
		participantsFromLocals([]string{"sarah.chen", "marcus.johnson", "alex.rivera", "emma.larsson"}), false)

	// 11:00 Customer Demo (1h) [wave-meeting]
	addEvent("wed-demo", "Customer Demo - Northwind Corp",
		"Demo the new webmail features to the Northwind Corp team. Prepare the staging environment.\n\n[wave-meeting]",
		"PT1H", wed.Add(11*time.Hour),
		participantsFromLocals([]string{"emma.larsson", "priya.patel", "marcus.johnson"}), false)

	// 14:00 Pair Programming (2h)
	addEvent("wed-pair", "Pair Programming: Email Threading",
		"Pair on the email threading implementation. Focus on JMAP conversation grouping.",
		"PT2H", wed.Add(14*time.Hour),
		participantsFromLocals([]string{"marcus.johnson", "alex.rivera"}), false)

	// --- Thursday ---
	thu := monday.AddDate(0, 0, 3)

	// 9:00 Standup [wave-meeting]
	addEvent("thu-standup", "Daily Standup",
		"Quick sync on progress, blockers, and plans for the day.\n\n[wave-meeting]",
		"PT15M", thu.Add(9*time.Hour),
		participantsFromLocals([]string{"sarah.chen", "marcus.johnson", "alex.rivera", "emma.larsson"}), false)

	// 10:00 Retrospective (1h)
	addEvent("thu-retro", "Sprint Retrospective",
		"Sprint retrospective - what went well, what to improve, action items.",
		"PT1H", thu.Add(10*time.Hour),
		participantsFromLocals([]string{"emma.larsson", "sarah.chen", "marcus.johnson", "priya.patel"}), false)

	// 13:30 Budget Planning (1h)
	addEvent("thu-budget", "Budget Planning - Q2",
		"Q2 budget review with finance. Bring your team's resource requests.",
		"PT1H", thu.Add(13*time.Hour+30*time.Minute),
		participantsFromLocals([]string{"sarah.chen", "emma.larsson"}), false)

	// 16:00 Team Social (30min)
	addEvent("thu-social", "Team Social",
		"Casual catch-up. Bring your beverage of choice!",
		"PT30M", thu.Add(16*time.Hour),
		participantsFromLocals([]string{"emma.larsson", "sarah.chen", "marcus.johnson", "priya.patel"}), false)

	// --- Friday ---
	fri := monday.AddDate(0, 0, 4)

	// 9:00 Standup [wave-meeting]
	addEvent("fri-standup", "Daily Standup",
		"Quick sync on progress, blockers, and plans for the day.\n\n[wave-meeting]",
		"PT15M", fri.Add(9*time.Hour),
		participantsFromLocals([]string{"sarah.chen", "marcus.johnson", "alex.rivera", "emma.larsson"}), false)

	// 10:00 Roadmap Review (1.5h)
	addEvent("fri-roadmap", "Product Roadmap Review - H2 2026",
		"Review H2 2026 product roadmap with stakeholders. Come prepared with your team's priorities.",
		"PT1H30M", fri.Add(10*time.Hour),
		participantsFromLocals([]string{"emma.larsson", "sarah.chen", "marcus.johnson", "priya.patel"}), false)

	// 14:00 Friday Wrap-up (30min)
	addEvent("fri-wrapup", "Friday Wrap-up",
		"End-of-week sync. Share wins, review next week's plan.",
		"PT30M", fri.Add(14*time.Hour),
		participantsFromLocals([]string{"sarah.chen", "marcus.johnson", "alex.rivera"}), false)

	// ==================== REST OF MARCH (scattered events) ====================

	// Mar 28-29 (Saturday-Sunday): Company Offsite (all-day)
	sat := monday.AddDate(0, 0, 5)
	addEvent("offsite", "Company Offsite",
		"Annual company offsite at Grand Hotel. Team building, strategy sessions, and dinner.",
		"P2D", sat,
		participantsFromLocals([]string{"sarah.chen", "marcus.johnson", "emma.larsson", "priya.patel"}), true)

	// Mar 30 (Monday next week): Morning Coffee Chat + Project Kickoff
	nextMon := monday.AddDate(0, 0, 7)

	addEvent("next-coffee", "Morning Coffee Chat",
		"Informal catch-up with the remote team. No agenda, just vibes.",
		"PT30M", nextMon.Add(9*time.Hour),
		participantsFromLocals([]string{"emma.larsson", "alex.rivera", "priya.patel"}), false)

	addEvent("next-kickoff", "Project Kickoff: Notifications Revamp",
		"Kick off the notifications revamp project. Review scope, timeline, and team assignments.",
		"PT1H", nextMon.Add(14*time.Hour),
		participantsFromLocals([]string{"sarah.chen", "marcus.johnson", "priya.patel", "emma.larsson"}), false)

	// Mar 31 (Tuesday next week): Board Preparation + Executive Lunch
	nextTue := monday.AddDate(0, 0, 8)

	addEvent("next-board", "Board Preparation",
		"Prepare materials and talking points for the board meeting next week.",
		"PT2H", nextTue.Add(10*time.Hour),
		participantsFromLocals([]string{"sarah.chen", "emma.larsson"}), false)

	addEvent("next-lunch", "Executive Lunch",
		"Monthly executive team lunch at the Italian restaurant.",
		"PT1H", nextTue.Add(12*time.Hour),
		participantsFromLocals([]string{"sarah.chen", "emma.larsson", "marcus.johnson"}), false)

	// Send in batches of 10 and collect created event IDs
	keys := make([]string, 0, len(events))
	for k := range events {
		keys = append(keys, k)
	}

	// Map from creation key to server-assigned event ID
	createdIDs := map[string]string{}

	total := 0
	batchSize := 10
	for i := 0; i < len(keys); i += batchSize {
		end := i + batchSize
		if end > len(keys) {
			end = len(keys)
		}
		batch := map[string]interface{}{}
		for _, k := range keys[i:end] {
			batch[k] = events[k]
		}

		resp, err := c.jmapCall(jmapRequest{
			Using: []string{"urn:ietf:params:jmap:calendars", "urn:ietf:params:jmap:principals"},
			MethodCalls: [][]interface{}{
				{"CalendarEvent/set", map[string]interface{}{
					"accountId": c.accountID,
					"create":    batch,
				}, "0"},
			},
		})
		if err != nil {
			return total, fmt.Errorf("creating calendar events batch: %w", err)
		}

		// Parse created IDs from response
		var setResult struct {
			Created map[string]struct {
				ID string `json:"id"`
			} `json:"created"`
		}
		if err := json.Unmarshal(resp.MethodResponses[0][1], &setResult); err == nil {
			for key, val := range setResult.Created {
				createdIDs[key] = val.ID
			}
		}

		total += len(batch)
	}

	// Save participants to webmail DB via the webmail API
	participantsSaved := 0
	for key, eventID := range createdIDs {
		evt, ok := events[key].(map[string]interface{})
		if !ok {
			continue
		}
		parts, ok := evt["participants"].(map[string]interface{})
		if !ok || len(parts) == 0 {
			continue
		}

		// Build participant list for the webmail API
		var apiParts []map[string]string
		for _, p := range parts {
			pm, ok := p.(map[string]interface{})
			if !ok {
				continue
			}
			role := "attendee"
			if roles, ok := pm["roles"].(map[string]bool); ok && roles["owner"] {
				role = "owner"
			}
			apiParts = append(apiParts, map[string]string{
				"eventId": eventID,
				"email":   fmt.Sprint(pm["email"]),
				"name":    fmt.Sprint(pm["name"]),
				"role":    role,
				"status":  "accepted",
			})
		}

		if err := c.saveParticipants(eventID, apiParts); err != nil {
			// Non-fatal — log and continue
			fmt.Printf("  Warning: could not save participants for %s: %v\n", key, err)
			continue
		}
		participantsSaved++
	}

	if participantsSaved > 0 {
		fmt.Printf("  Saved participants for %d events\n", participantsSaved)
	}

	return total, nil
}

// --- Main ---

func main() {
	defaultURL := os.Getenv("STALWART_URL")
	if defaultURL == "" {
		defaultURL = "http://10.10.10.200:8081"
	}

	defaultWebmailURL := os.Getenv("WEBMAIL_URL")
	if defaultWebmailURL == "" {
		defaultWebmailURL = "https://webmail.massive-hosting.com"
	}

	url := flag.String("url", defaultURL, "Stalwart URL")
	webmailURL := flag.String("webmail-url", defaultWebmailURL, "Webmail API URL (for participant storage)")
	email := flag.String("email", "", "Account to seed (default: seeds both test accounts)")
	password := flag.String("password", "test1234", "Account password")
	clean := flag.Bool("clean", false, "Delete all existing data before seeding")
	flag.Parse()

	accounts := defaultAccounts
	if *email != "" {
		accounts = []account{{Email: *email, Password: *password}}
	}

	for _, acct := range accounts {
		if err := seedAccount(*url, *webmailURL, acct, *clean); err != nil {
			fmt.Fprintf(os.Stderr, "Error seeding %s: %v\n", acct.Email, err)
			os.Exit(1)
		}
	}

	// Enable free/busy and directory for the acme domain via direct DB
	// (webmail API doesn't have a write endpoint for this — it's managed via control panel)
	dbURL := os.Getenv("WEBMAIL_DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://webmail:webmail@10.10.10.200:5432/webmail?sslmode=disable"
	}
	fmt.Println("Enabling free/busy and directory...")
	if db, err := openDB(dbURL); err != nil {
		fmt.Printf("  Warning: could not connect to DB: %v\n", err)
	} else {
		_, err = db.Exec(`INSERT INTO domain_settings (domain, freebusy_enabled, directory_enabled) VALUES ('acme.customer.mhst.io', true, true) ON CONFLICT (domain) DO UPDATE SET freebusy_enabled = true, directory_enabled = true`)
		db.Close()
		if err != nil {
			fmt.Printf("  Warning: could not enable domain settings: %v\n", err)
		} else {
			fmt.Println("  Free/busy and directory enabled")
		}
	}

	fmt.Println("Done!")
}
