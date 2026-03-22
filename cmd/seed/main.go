package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"math/rand"
	"net/http"
	"os"
	"strings"
	"time"
)

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
		Name                 string          `json:"name"`
		IsPersonal           bool            `json:"isPersonal"`
		AccountCapabilities  map[string]json.RawMessage `json:"accountCapabilities"`
	} `json:"accounts"`
	PrimaryAccounts map[string]string `json:"primaryAccounts"`
	UploadURL       string            `json:"uploadUrl"`
	DownloadURL     string            `json:"downloadUrl"`
}

// --- Client ---

type client struct {
	baseURL    string
	email      string
	password   string
	httpClient *http.Client
	accountID  string
	session    *jmapSession
}

func newClient(baseURL, email, password string) *client {
	return &client{
		baseURL:    strings.TrimRight(baseURL, "/"),
		email:      email,
		password:   password,
		httpClient: &http.Client{Timeout: 30 * time.Second},
	}
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

var senders = []sender{
	{"Sarah Chen", "sarah@techcorp.io"},
	{"Marcus Johnson", "marcus.johnson@innovatelab.com"},
	{"Priya Patel", "priya@designstudio.co"},
	{"Alex Rivera", "alex.rivera@cloudops.net"},
	{"Emma Larsson", "emma.larsson@nordictech.se"},
	{"Yuki Tanaka", "yuki@tokyodev.jp"},
	{"David Kim", "david.kim@startuphq.com"},
	{"Fatima Al-Hassan", "fatima@menadigital.ae"},
	{"James O'Brien", "james@dublinsoft.ie"},
	{"Lin Wei", "lin.wei@shenzhenai.cn"},
	{"GitHub", "noreply@github.com"},
	{"Jira", "jira@atlassian.com"},
	{"Slack", "notification@slack.com"},
	{"AWS", "no-reply@aws.amazon.com"},
	{"Google Cloud", "cloudnotify@google.com"},
}

var newsletterSubjects = []string{
	"This Week in Tech: AI Developments",
	"Go Weekly #412 - Generics Deep Dive",
	"Frontend Focus: New CSS Features Landing",
	"DevOps Digest: Container Security Best Practices",
	"The Pragmatic Engineer Newsletter",
	"Kubernetes Release Notes v1.31",
	"PostgreSQL Performance Tips",
	"Cloud Architecture Patterns - March Edition",
	"Open Source Spotlight: New Projects",
	"Security Advisory: Critical Updates",
}

var newsletterBodies = []string{
	`<h2>This Week in Tech</h2>
<p>Welcome to this week's roundup of the most important developments in technology.</p>
<p><strong>Top Stories:</strong></p>
<ul>
<li>New AI models show improved reasoning capabilities</li>
<li>Major cloud provider announces edge computing expansion</li>
<li>Open source project reaches 100k GitHub stars</li>
</ul>
<p>Read more at <a href="https://example.com">our website</a>.</p>`,

	`<h2>Go Weekly</h2>
<p>Your weekly dose of Go programming news and tutorials.</p>
<p><strong>Featured Article:</strong> Understanding Go's new range-over-func feature and how it changes iteration patterns.</p>
<p>Also this week:</p>
<ul>
<li>Optimizing memory allocations in hot paths</li>
<li>Building resilient microservices with Go</li>
<li>New testing patterns for table-driven tests</li>
</ul>`,

	`<h2>Frontend Focus</h2>
<p>The latest in web development, CSS, and JavaScript.</p>
<p><strong>CSS Container Queries</strong> are now supported in all major browsers. Here's how to start using them today.</p>
<p>Plus: A deep dive into the new <code>Popover API</code> and what it means for accessible UI components.</p>`,

	`<h2>DevOps Digest</h2>
<p>Stay up to date with the latest in DevOps, SRE, and platform engineering.</p>
<p><strong>This Month's Focus: Container Security</strong></p>
<p>We examine the top vulnerabilities found in container images and how to build a secure CI/CD pipeline with automated scanning.</p>
<blockquote>Security is not a feature, it's a foundation.</blockquote>`,

	`<h2>The Pragmatic Engineer</h2>
<p>Insights from the tech industry, engineering culture, and career growth.</p>
<p><strong>Compensation Trends in 2026:</strong> We surveyed 5,000 engineers across 40 countries. Here are the surprising results.</p>
<p>Key takeaway: Remote roles are seeing <em>increased</em> compensation in specialized areas.</p>`,

	`<h2>Kubernetes v1.31 Release Notes</h2>
<p>The latest Kubernetes release includes several important changes:</p>
<ul>
<li>Sidecar containers are now GA</li>
<li>Improved scheduler performance for large clusters</li>
<li>New pod lifecycle hooks</li>
<li>Deprecation of legacy API versions</li>
</ul>
<p>Upgrade guide available at <a href="https://kubernetes.io">kubernetes.io</a>.</p>`,

	`<h2>PostgreSQL Performance Tips</h2>
<p>Optimize your database for production workloads.</p>
<p><strong>Tip #47: Partial Indexes</strong></p>
<p>If you frequently query a subset of your data, partial indexes can dramatically reduce index size and improve query performance:</p>
<p><code>CREATE INDEX idx_active_users ON users (email) WHERE active = true;</code></p>`,

	`<h2>Cloud Architecture Patterns</h2>
<p>Monthly deep-dive into cloud-native architecture patterns.</p>
<p><strong>This Month: Event Sourcing at Scale</strong></p>
<p>We explore how three companies implemented event sourcing for their core domains, the challenges they faced, and the patterns that emerged.</p>`,

	`<h2>Open Source Spotlight</h2>
<p>Discovering interesting open source projects.</p>
<p><strong>Featured Projects:</strong></p>
<ul>
<li><strong>htmx</strong> - High power tools for HTML</li>
<li><strong>Ruff</strong> - An extremely fast Python linter</li>
<li><strong>Biome</strong> - Toolchain for web projects</li>
</ul>`,

	`<h2>Security Advisory</h2>
<p><strong style="color: #d32f2f;">CRITICAL: Update Required</strong></p>
<p>A vulnerability has been discovered in the following packages. Please update immediately:</p>
<ul>
<li>libxml2 &lt; 2.12.5</li>
<li>openssl &lt; 3.2.1</li>
</ul>
<p>Patches are available now. See <a href="https://example.com/advisory">the full advisory</a> for details.</p>`,
}

func generateWelcomeEmail(acctEmail string, mb *mailboxes) emailSpec {
	return emailSpec{
		From:     "hello@acme-hosting.com",
		FromName: "Acme Hosting",
		To:       acctEmail,
		Subject:  "Welcome to Acme Hosting!",
		HTMLBody: wrapHTML(fmt.Sprintf(`<h1 style="color: #2563eb;">Welcome to Acme Hosting!</h1>
<p>Hi there,</p>
<p>We're thrilled to have you on board. Your account <strong>%s</strong> is all set up and ready to go.</p>
<h2>Getting Started</h2>
<ul>
<li>Check out our <a href="https://docs.acme-hosting.com">documentation</a></li>
<li>Set up your <a href="https://acme-hosting.com/settings">email preferences</a></li>
<li>Join our <a href="https://community.acme-hosting.com">community forum</a></li>
</ul>
<p>If you need any help, just reply to this email or visit our <a href="https://support.acme-hosting.com">support center</a>.</p>
<p>Best regards,<br><strong>The Acme Hosting Team</strong></p>
<hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
<p style="color: #9ca3af; font-size: 12px;">Acme Hosting Inc. | 123 Cloud Street, San Francisco, CA 94105</p>`, acctEmail)),
		Date:      randomDate(28),
		MailboxID: mb.Inbox,
		IsRead:    true,
	}
}

func generateNewsletterEmails(acctEmail string, mb *mailboxes) []emailSpec {
	specs := make([]emailSpec, 10)
	for i := 0; i < 10; i++ {
		s := senders[rand.Intn(len(senders))]
		specs[i] = emailSpec{
			From:      s.Email,
			FromName:  s.Name,
			To:        acctEmail,
			Subject:   newsletterSubjects[i],
			HTMLBody:  wrapHTML(newsletterBodies[i]),
			Date:      randomDate(30),
			MailboxID: mb.Inbox,
			IsRead:    i < 6, // 60% read
		}
	}
	return specs
}

func generateAttachmentEmails(acctEmail string, mb *mailboxes) []emailSpec {
	attachmentEmails := []struct {
		subject     string
		sender      sender
		attachments []attachmentSpec
		body        string
	}{
		{
			subject: "Q4 Budget Review - Final",
			sender:  sender{"Sarah Chen", "sarah@techcorp.io"},
			attachments: []attachmentSpec{
				{Filename: "Q4_Budget_2025.xlsx", ContentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"},
				{Filename: "Budget_Summary.pdf", ContentType: "application/pdf"},
			},
			body: `<p>Hi,</p>
<p>Please find attached the final Q4 budget review documents. The spreadsheet has all the detailed breakdowns and the PDF is the executive summary.</p>
<p>Key highlights:</p>
<ul>
<li>Total spend: $2.4M (5% under budget)</li>
<li>Infrastructure costs down 12% after cloud optimization</li>
<li>Headcount costs as projected</li>
</ul>
<p>Let me know if you have any questions before the board meeting.</p>
<p>Best,<br>Sarah</p>`,
		},
		{
			subject: "Design Mockups v3",
			sender:  sender{"Priya Patel", "priya@designstudio.co"},
			attachments: []attachmentSpec{
				{Filename: "Dashboard_Redesign_v3.png", ContentType: "image/png"},
				{Filename: "Mobile_Views.png", ContentType: "image/png"},
				{Filename: "Component_Library.fig", ContentType: "application/octet-stream"},
			},
			body: `<p>Hey team,</p>
<p>Here are the updated mockups incorporating last week's feedback:</p>
<ul>
<li>Simplified navigation sidebar</li>
<li>New color palette for data visualizations</li>
<li>Mobile responsive layouts</li>
</ul>
<p>The Figma file has all the components. Let me know your thoughts!</p>
<p>Priya</p>`,
		},
		{
			subject: "Contract - Signed Copy",
			sender:  sender{"James O'Brien", "james@dublinsoft.ie"},
			attachments: []attachmentSpec{
				{Filename: "Service_Agreement_2026_Signed.pdf", ContentType: "application/pdf"},
			},
			body: `<p>Hi,</p>
<p>Please find attached the fully executed service agreement for 2026. Both parties have signed.</p>
<p>Key dates:</p>
<ul>
<li>Start date: April 1, 2026</li>
<li>First review: July 1, 2026</li>
<li>Term: 12 months</li>
</ul>
<p>Filed a copy with legal as well.</p>
<p>Cheers,<br>James</p>`,
		},
		{
			subject: "Meeting Notes - Sprint Retrospective",
			sender:  sender{"Marcus Johnson", "marcus.johnson@innovatelab.com"},
			attachments: []attachmentSpec{
				{Filename: "Sprint_23_Retro_Notes.md", ContentType: "text/markdown"},
			},
			body: `<p>Team,</p>
<p>Notes from today's retro attached. Summary of action items:</p>
<ol>
<li>Improve test coverage for auth module (assigned: Alex)</li>
<li>Set up automated deployment to staging (assigned: David)</li>
<li>Document API versioning strategy (assigned: Lin)</li>
</ol>
<p>Great sprint everyone!</p>
<p>Marcus</p>`,
		},
		{
			subject: "Your Invoice #INV-2026-0342",
			sender:  sender{"Billing", "billing@cloudservices.com"},
			attachments: []attachmentSpec{
				{Filename: "Invoice_INV-2026-0342.pdf", ContentType: "application/pdf"},
			},
			body: `<p>Dear Customer,</p>
<p>Please find your invoice attached for the billing period March 1-31, 2026.</p>
<table style="border-collapse: collapse; width: 100%;">
<tr style="background: #f3f4f6;"><td style="padding: 8px; border: 1px solid #e5e7eb;"><strong>Service</strong></td><td style="padding: 8px; border: 1px solid #e5e7eb;"><strong>Amount</strong></td></tr>
<tr><td style="padding: 8px; border: 1px solid #e5e7eb;">Compute (m6i.xlarge x3)</td><td style="padding: 8px; border: 1px solid #e5e7eb;">$847.20</td></tr>
<tr><td style="padding: 8px; border: 1px solid #e5e7eb;">Storage (500GB)</td><td style="padding: 8px; border: 1px solid #e5e7eb;">$45.00</td></tr>
<tr><td style="padding: 8px; border: 1px solid #e5e7eb;">Bandwidth</td><td style="padding: 8px; border: 1px solid #e5e7eb;">$23.50</td></tr>
<tr style="background: #f3f4f6;"><td style="padding: 8px; border: 1px solid #e5e7eb;"><strong>Total</strong></td><td style="padding: 8px; border: 1px solid #e5e7eb;"><strong>$915.70</strong></td></tr>
</table>
<p>Payment is due within 30 days.</p>`,
		},
	}

	specs := make([]emailSpec, len(attachmentEmails))
	for i, ae := range attachmentEmails {
		specs[i] = emailSpec{
			From:        ae.sender.Email,
			FromName:    ae.sender.Name,
			To:          acctEmail,
			Subject:     ae.subject,
			HTMLBody:    wrapHTML(ae.body),
			Date:        randomDate(25),
			MailboxID:   mb.Inbox,
			IsRead:      rand.Float32() < 0.6,
			Attachments: ae.attachments,
		}
	}
	return specs
}

type conversation struct {
	subject  string
	messages []struct {
		from sender
		body string
	}
}

func generateThreadedConversations(acctEmail string, mb *mailboxes) []emailSpec {
	conversations := []conversation{
		{
			subject: "API Migration Plan",
			messages: []struct {
				from sender
				body string
			}{
				{sender{"Alex Rivera", "alex.rivera@cloudops.net"}, `<p>Hey team,</p><p>I've drafted the API migration plan for moving from v2 to v3. Main changes:</p><ul><li>New authentication flow using OAuth2</li><li>Pagination changes (cursor-based)</li><li>Rate limiting updates</li></ul><p>Thoughts?</p>`},
				{sender{"You", acctEmail}, `<p>Looks solid, Alex. A couple of questions:</p><ol><li>What's the timeline for deprecating v2 endpoints?</li><li>Do we need to update the SDK clients simultaneously?</li></ol><p>Also, should we set up a migration guide for external consumers?</p>`},
				{sender{"Alex Rivera", "alex.rivera@cloudops.net"}, `<p>Good questions:</p><p>1. Thinking 6-month deprecation window with v2 in maintenance mode from day one.<br>2. SDKs should be updated in parallel - I'll coordinate with the SDK team.</p><p>Migration guide is a great idea. I'll add it to the plan.</p>`},
				{sender{"David Kim", "david.kim@startuphq.com"}, `<p>+1 on the migration guide. Our largest customers will need hand-holding through this.</p><p>Can we also add a compatibility layer so v2 requests get auto-translated? That would ease the transition significantly.</p>`},
			},
		},
		{
			subject: "Office Party Planning",
			messages: []struct {
				from sender
				body string
			}{
				{sender{"Emma Larsson", "emma.larsson@nordictech.se"}, `<p>Hi everyone!</p><p>It's time to start planning our spring office party. I'm thinking:</p><ul><li>Date: Last Friday of March</li><li>Venue: The rooftop terrace</li><li>Theme: Spring garden party</li></ul><p>Budget is $3,000. Who wants to help organize?</p>`},
				{sender{"You", acctEmail}, `<p>Count me in! I can handle the catering arrangements. Should we do a survey for dietary restrictions?</p>`},
				{sender{"Fatima Al-Hassan", "fatima@menadigital.ae"}, `<p>I can help with decorations! A garden theme sounds lovely. Will there be music? I know a great local band.</p>`},
				{sender{"Emma Larsson", "emma.larsson@nordictech.se"}, `<p>Perfect! Yes to the survey and yes to the band, Fatima. Let's keep music budget around $500-800.</p><p>I'll create a shared doc for planning. Meeting this Thursday at 2pm to discuss details?</p>`},
			},
		},
		{
			subject: "Production Incident - Database Connection Pool",
			messages: []struct {
				from sender
				body string
			}{
				{sender{"AWS", "no-reply@aws.amazon.com"}, `<p><strong>Alert: High connection count detected</strong></p><p>Your RDS instance <code>prod-main-db</code> has exceeded 80% of max_connections.</p><p>Current: 412/500 connections<br>Threshold: 80%<br>Time: 2026-03-14 14:32:00 UTC</p>`},
				{sender{"You", acctEmail}, `<p>Team, we're seeing connection pool exhaustion on prod. I'm investigating.</p><p>Initial findings: looks like the new batch job isn't closing connections properly. Rolling back the deployment now.</p>`},
				{sender{"Lin Wei", "lin.wei@shenzhenai.cn"}, `<p>Confirmed - the batch job was opening new connections per iteration instead of reusing from the pool. Fix is in PR #847. Connection count is dropping after the rollback.</p><p>Current: 156/500 connections.</p>`},
			},
		},
		{
			subject: "Interview Feedback - Senior Engineer Candidate",
			messages: []struct {
				from sender
				body string
			}{
				{sender{"Marcus Johnson", "marcus.johnson@innovatelab.com"}, `<p>Team,</p><p>Please share your feedback on today's candidate (Jane Martinez) for the Senior Engineer position.</p><p>My take: Strong system design skills, good communication. The live coding was impressive - she optimized the solution from O(n^2) to O(n log n) without hints.</p>`},
				{sender{"Yuki Tanaka", "yuki@tokyodev.jp"}, `<p>Agree with Marcus. I was particularly impressed with her experience in distributed systems. She asked very thoughtful questions about our architecture.</p><p>One concern: she mentioned wanting to focus on ML infrastructure, and we don't have much of that yet. Might be a retention risk.</p>`},
				{sender{"You", acctEmail}, `<p>Strong hire from me. The system design round was the best I've seen this quarter. She designed a scalable notification system with proper failure handling and retry logic.</p><p>Re: ML interest - I think that actually aligns with our 2026 H2 roadmap. We could pitch that as a growth opportunity.</p>`},
			},
		},
		{
			subject: "Quarterly Team Objectives",
			messages: []struct {
				from sender
				body string
			}{
				{sender{"David Kim", "david.kim@startuphq.com"}, `<p>Hi all,</p><p>Sharing draft OKRs for Q2. Please review and add your team's objectives by Friday:</p><p><strong>Objective 1: Improve Platform Reliability</strong></p><ul><li>KR1: Achieve 99.95% uptime (currently 99.9%)</li><li>KR2: Reduce P1 incident MTTR to under 30 min</li><li>KR3: Implement automated failover for all critical services</li></ul><p><strong>Objective 2: Scale Engineering Velocity</strong></p><ul><li>KR1: Reduce CI/CD pipeline time by 40%</li><li>KR2: Increase test coverage to 85%</li></ul>`},
				{sender{"You", acctEmail}, `<p>Looks good, David. For our team I'd add:</p><p><strong>Objective 3: Modernize Email Infrastructure</strong></p><ul><li>KR1: Complete JMAP integration for all mailbox operations</li><li>KR2: Launch new webmail UI to 50% of users</li><li>KR3: Reduce email processing latency by 60%</li></ul>`},
				{sender{"Sarah Chen", "sarah@techcorp.io"}, `<p>Love objective 3! Aligns well with the infrastructure budget savings we're targeting.</p><p>Can we also add a KR around user satisfaction? Something like "Achieve NPS > 40 for webmail experience" - this would give us a concrete user-facing metric.</p>`},
				{sender{"David Kim", "david.kim@startuphq.com"}, `<p>Great additions from both of you. I'll update the doc. Let's finalize in Monday's leadership sync.</p><p>Also adding a stretch goal: "Zero-downtime deployments for all user-facing services by end of Q2."</p>`},
			},
		},
	}

	var specs []emailSpec
	for _, conv := range conversations {
		baseDate := randomDate(20)
		var prevMessageID string
		var refs []string

		for j, msg := range conv.messages {
			msgDate := baseDate.Add(time.Duration(j*2+rand.Intn(3)) * time.Hour)
			messageID := fmt.Sprintf("<thread-%d-msg-%d@seed.local>", rand.Int63(), j)

			subject := conv.subject
			if j > 0 {
				subject = "Re: " + conv.subject
			}

			from := msg.from.Email
			fromName := msg.from.Name
			to := acctEmail

			// If "You" is the sender, swap from/to
			if msg.from.Email == acctEmail {
				fromName = ""
				// Just use the email as both name and address
				from = acctEmail
				to = conversations[0].messages[0].from.Email // reply to original sender
			}

			spec := emailSpec{
				From:      from,
				FromName:  fromName,
				To:        to,
				Subject:   subject,
				HTMLBody:  wrapHTML(msg.body),
				Date:      msgDate,
				MailboxID: mb.Inbox,
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

func generateSentEmails(acctEmail string, mb *mailboxes) []emailSpec {
	sentEmails := []struct {
		to      string
		toName  string
		subject string
		body    string
	}{
		{
			to: "sarah@techcorp.io", toName: "Sarah Chen",
			subject: "Re: Project Timeline Update",
			body:    `<p>Hi Sarah,</p><p>Thanks for the update. The revised timeline looks realistic. I've adjusted our sprint plan accordingly.</p><p>Let's sync next Tuesday to review progress.</p><p>Best</p>`,
		},
		{
			to: "team@acme-hosting.com", toName: "Team",
			subject: "Deployment Checklist - Friday Release",
			body:    `<p>Team,</p><p>Here's the checklist for Friday's release:</p><ol><li>Run full regression suite</li><li>Update API documentation</li><li>Notify beta customers</li><li>Stage the deployment at 2pm</li><li>Go live at 4pm (low traffic window)</li></ol><p>Please confirm you've reviewed your section.</p>`,
		},
		{
			to: "hr@acme-hosting.com", toName: "HR Department",
			subject: "PTO Request - March 28-30",
			body:    `<p>Hi HR,</p><p>I'd like to request PTO for March 28-30 (Thursday-Saturday). I have no critical deliverables that week and have arranged coverage with the team.</p><p>Thanks!</p>`,
		},
		{
			to: "priya@designstudio.co", toName: "Priya Patel",
			subject: "Feedback on New Dashboard Designs",
			body:    `<p>Hey Priya,</p><p>Reviewed the latest mockups. Overall they look great! A few suggestions:</p><ul><li>The sidebar feels a bit cramped on 1366px screens - can we test with narrower viewports?</li><li>Love the new color scheme for charts</li><li>Can we add a "last updated" timestamp to each widget?</li></ul><p>Happy to jump on a call to discuss.</p>`,
		},
		{
			to: "vendor@supplies.com", toName: "Office Supplies Co",
			subject: "Re: Order Confirmation #ORD-7823",
			body:    `<p>Thanks for confirming the order. Please deliver to the main office reception, 3rd floor.</p><p>Delivery contact: Front desk, ext. 100.</p>`,
		},
	}

	specs := make([]emailSpec, len(sentEmails))
	for i, se := range sentEmails {
		specs[i] = emailSpec{
			From:      acctEmail,
			FromName:  "",
			To:        fmt.Sprintf("%s <%s>", se.toName, se.to),
			Subject:   se.subject,
			HTMLBody:  wrapHTML(se.body),
			Date:      randomDate(15),
			MailboxID: mb.Sent,
			IsRead:    true,
		}
	}
	return specs
}

func generateDraftEmails(acctEmail string, mb *mailboxes) []emailSpec {
	drafts := []struct {
		to      string
		subject string
		body    string
	}{
		{
			to:      "team@acme-hosting.com",
			subject: "RFC: New Caching Strategy",
			body:    `<p>Team,</p><p>I've been thinking about our caching approach and wanted to propose some changes:</p><p><strong>Current issues:</strong></p><ul><li>Cache invalidation is inconsistent</li><li>TTLs are too aggressive for static content</li></ul><p><strong>Proposed changes:</strong></p><p>[TODO: flesh this out]</p>`,
		},
		{
			to:      "manager@acme-hosting.com",
			subject: "1:1 Agenda Items",
			body:    `<p>Topics for our next 1:1:</p><ul><li>Career growth discussion</li><li>Team hiring priorities</li><li>Conference budget for Q2</li></ul>`,
		},
		{
			to:      "",
			subject: "Blog Post Draft - JMAP Migration Story",
			body:    `<p><em>Draft - Work in Progress</em></p><h1>How We Migrated Our Email Platform to JMAP</h1><p>When we started evaluating email protocols for our next-generation webmail client, we knew IMAP wasn't going to cut it anymore...</p><p>[Continue writing]</p>`,
		},
	}

	specs := make([]emailSpec, len(drafts))
	for i, d := range drafts {
		specs[i] = emailSpec{
			From:      acctEmail,
			FromName:  "",
			To:        d.to,
			Subject:   d.subject,
			HTMLBody:  wrapHTML(d.body),
			Date:      randomDate(5),
			MailboxID: mb.Drafts,
			IsRead:    true,
			IsDraft:   true,
		}
	}
	return specs
}

func generateJunkEmails(acctEmail string, mb *mailboxes) []emailSpec {
	return []emailSpec{
		{
			From:     "winner@lottery-intl.xyz",
			FromName: "International Lottery Commission",
			To:       acctEmail,
			Subject:  "CONGRATULATIONS! You've Won $5,000,000!!!",
			HTMLBody: wrapHTML(`<p style="color: red; font-size: 18px;"><strong>YOU ARE A WINNER!!!</strong></p>
<p>Dear Lucky Winner,</p>
<p>Your email was selected in our INTERNATIONAL MEGA LOTTERY DRAW. You have won the sum of <strong>$5,000,000.00 USD</strong>!!!</p>
<p>To claim your prize, send your full name, address, and bank details to our claims department IMMEDIATELY.</p>
<p>ACT NOW - this offer expires in 24 hours!!!</p>
<p><em>Dr. James Williams<br>Claims Director<br>International Lottery Commission</em></p>`),
			Date:      randomDate(7),
			MailboxID: mb.Junk,
			IsRead:    false,
		},
		{
			From:     "deals@cheapmeds-online.ru",
			FromName: "Online Pharmacy",
			To:       acctEmail,
			Subject:  "70% OFF - Limited Time Offer on Premium Products",
			HTMLBody: wrapHTML(`<p>BEST DEALS ONLINE - UP TO 70% OFF</p>
<p>Click here for amazing discounts on thousands of products!</p>
<p>FREE SHIPPING on all orders over $50!</p>
<p>BUY NOW: <a href="https://example.com">www.totally-legit-deals.com</a></p>
<p><small>To unsubscribe click <a href="https://example.com">here</a></small></p>`),
			Date:      randomDate(3),
			MailboxID: mb.Junk,
			IsRead:    false,
		},
	}
}

func generateTrashEmails(acctEmail string, mb *mailboxes) []emailSpec {
	return []emailSpec{
		{
			From:     "noreply@service.example.com",
			FromName: "Example Service",
			To:       acctEmail,
			Subject:  "Your password has been changed",
			HTMLBody: wrapHTML(`<p>Hi,</p><p>This is a confirmation that your password was successfully changed on March 10, 2026.</p><p>If you didn't make this change, please contact support immediately.</p>`),
			Date:      randomDate(10),
			MailboxID: mb.Trash,
			IsRead:    true,
		},
		{
			From:     "newsletter@oldservice.com",
			FromName: "Old Newsletter",
			To:       acctEmail,
			Subject:  "Weekly Update #283",
			HTMLBody: wrapHTML(`<p>This week's update from Old Service...</p><p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p>`),
			Date:      randomDate(14),
			MailboxID: mb.Trash,
			IsRead:    true,
		},
	}
}

func generateStarredEmails(acctEmail string, mb *mailboxes) []emailSpec {
	starred := []struct {
		from    sender
		subject string
		body    string
	}{
		{
			from:    sender{"Sarah Chen", "sarah@techcorp.io"},
			subject: "Important: Server Credentials",
			body:    `<p>Here are the credentials you requested for the staging environment. Please store them securely.</p><p><strong>Host:</strong> staging.internal.acme.io<br><strong>Port:</strong> 5432<br><strong>Database:</strong> webmail_staging</p><p>These rotate every 30 days.</p>`,
		},
		{
			from:    sender{"David Kim", "david.kim@startuphq.com"},
			subject: "Meeting Notes - Architecture Decision",
			body:    `<p>Summary of today's architecture review:</p><p><strong>Decision:</strong> We'll go with JMAP as the primary protocol for the new webmail client.</p><p><strong>Rationale:</strong> Better performance, built-in push support, cleaner API than IMAP.</p><p><strong>Timeline:</strong> MVP by end of Q2.</p>`,
		},
		{
			from:    sender{"Yuki Tanaka", "yuki@tokyodev.jp"},
			subject: "Your Promotion Approval",
			body:    `<p>Hi,</p><p>Great news! Your promotion to Senior Engineer has been approved, effective April 1. HR will follow up with the details.</p><p>Well deserved - congratulations!</p>`,
		},
		{
			from:    sender{"Lin Wei", "lin.wei@shenzhenai.cn"},
			subject: "Useful Resources - System Design",
			body:    `<p>Hey, here are those system design resources I mentioned:</p><ul><li><a href="https://example.com">Designing Data-Intensive Applications</a></li><li><a href="https://example.com">System Design Interview guide</a></li><li><a href="https://example.com">Distributed Systems Patterns</a></li></ul><p>The first one is especially good for our current project.</p>`,
		},
		{
			from:    sender{"Jira", "jira@atlassian.com"},
			subject: "[WEBMAIL-142] Launch checklist - assigned to you",
			body:    `<p><strong>WEBMAIL-142: Launch Checklist for Webmail v2</strong></p><p>Priority: <span style="color: #d32f2f;">Critical</span><br>Sprint: Sprint 24<br>Due: March 31, 2026</p><p>Checklist:<br>- [ ] Load testing complete<br>- [ ] Security audit passed<br>- [ ] Documentation updated<br>- [ ] Rollback plan documented</p>`,
		},
	}

	specs := make([]emailSpec, len(starred))
	for i, s := range starred {
		specs[i] = emailSpec{
			From:      s.from.Email,
			FromName:  s.from.Name,
			To:        acctEmail,
			Subject:   s.subject,
			HTMLBody:  wrapHTML(s.body),
			Date:      randomDate(20),
			MailboxID: mb.Inbox,
			IsRead:    true,
			IsFlagged: true,
		}
	}
	return specs
}

func generateInternalEmails(acctEmail string, mb *mailboxes) []emailSpec {
	// Extract domain from account email
	parts := strings.SplitN(acctEmail, "@", 2)
	if len(parts) < 2 {
		return nil
	}
	domain := parts[1]

	colleagues := []struct {
		local   string
		name    string
		subject string
		body    string
	}{
		{
			local:   "sarah.chen",
			name:    "Sarah Chen",
			subject: "Quick sync about the deployment?",
			body:    `<p>Hey,</p><p>Can we hop on a quick call to discuss the deployment schedule for next week? I have some concerns about the database migration timing.</p><p>Free anytime this afternoon.</p><p>Sarah</p>`,
		},
		{
			local:   "marcus.johnson",
			name:    "Marcus Johnson",
			subject: "Code review feedback",
			body:    `<p>Hi,</p><p>I've reviewed PR #847 and left some comments. The overall approach looks solid, but I think we should discuss the caching strategy before merging.</p><p>Want to jump on a call?</p><p>Marcus</p>`,
		},
		{
			local:   "priya.patel",
			name:    "Priya Patel",
			subject: "Design handoff ready",
			body:    `<p>Hi there!</p><p>The new dashboard mockups are finalized and ready for handoff. I've uploaded everything to Figma.</p><p>Let me know if you want to walk through them together — happy to do a quick video call.</p><p>Priya</p>`,
		},
		{
			local:   "alex.rivera",
			name:    "Alex Rivera",
			subject: "Staging environment issue",
			body:    `<p>Hey,</p><p>I noticed the staging environment is throwing 502 errors intermittently. I've checked the logs and it seems like a memory issue.</p><p>Can you take a look when you get a chance? Happy to screenshare if that helps.</p><p>Alex</p>`,
		},
		{
			local:   "emma.larsson",
			name:    "Emma Larsson",
			subject: "Sprint retrospective notes",
			body:    `<p>Hi team,</p><p>Here are the action items from today's retro:</p><ul><li>Improve PR review turnaround time</li><li>Set up automated staging deploys</li><li>Document the API versioning strategy</li></ul><p>Let's discuss priorities in our next standup.</p><p>Emma</p>`,
		},
	}

	var specs []emailSpec
	for _, c := range colleagues {
		fromEmail := c.local + "@" + domain
		// Don't send email from yourself to yourself
		if fromEmail == acctEmail {
			continue
		}
		specs = append(specs, emailSpec{
			From:      fromEmail,
			FromName:  c.name,
			To:        acctEmail,
			Subject:   c.subject,
			HTMLBody:  wrapHTML(c.body),
			Date:      randomDate(3),
			MailboxID: mb.Inbox,
			IsRead:    false,
		})
	}
	return specs
}

// --- Seed function ---

func seedAccount(baseURL string, acct account, clean bool) error {
	fmt.Printf("Seeding %s...\n", acct.Email)

	c := newClient(baseURL, acct.Email, acct.Password)
	if err := c.fetchSession(); err != nil {
		return fmt.Errorf("fetching session for %s: %w", acct.Email, err)
	}

	mb, err := c.getMailboxes()
	if err != nil {
		return fmt.Errorf("getting mailboxes: %w", err)
	}

	if clean {
		fmt.Println("  Cleaning existing emails...")
		if err := c.cleanEmails(); err != nil {
			return fmt.Errorf("cleaning emails: %w", err)
		}
	}

	// Collect all emails
	var allEmails []emailSpec

	// 1. Welcome email
	allEmails = append(allEmails, generateWelcomeEmail(acct.Email, mb))

	// 2. Newsletter emails (10)
	allEmails = append(allEmails, generateNewsletterEmails(acct.Email, mb)...)

	// 3. Attachment emails (5)
	allEmails = append(allEmails, generateAttachmentEmails(acct.Email, mb)...)

	// 4. Threaded conversations (~18 messages from 5 threads)
	threadEmails := generateThreadedConversations(acct.Email, mb)
	allEmails = append(allEmails, threadEmails...)

	// 5. Sent emails (5)
	allEmails = append(allEmails, generateSentEmails(acct.Email, mb)...)

	// 6. Draft emails (3)
	allEmails = append(allEmails, generateDraftEmails(acct.Email, mb)...)

	// 7. Junk emails (2)
	allEmails = append(allEmails, generateJunkEmails(acct.Email, mb)...)

	// 8. Trash emails (2)
	allEmails = append(allEmails, generateTrashEmails(acct.Email, mb)...)

	// 9. Starred emails (5)
	allEmails = append(allEmails, generateStarredEmails(acct.Email, mb)...)

	// 10. Internal emails from same-domain colleagues (for Wave call testing)
	allEmails = append(allEmails, generateInternalEmails(acct.Email, mb)...)

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

	fmt.Printf("  Created %d emails (%d unread, %d starred, 5 threads)\n", len(allEmails), unread, starred)

	// --- Contacts ---
	if c.hasCapability("urn:ietf:params:jmap:contacts") {
		contactCount, err := seedContacts(c)
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
		eventCount, err := seedCalendarEvents(c)
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

func seedContacts(c *client) (int, error) {
	// Get the default address book ID so contacts are visible in the webmail.
	addressBookID, err := getDefaultAddressBookID(c)
	if err != nil {
		return 0, fmt.Errorf("getting default address book: %w", err)
	}

	type contactDef struct {
		fullName     string
		emails       []string
		phone        string
		org          string
		title        string
		address      string
		notes        string
	}

	contacts := []contactDef{
		{"Sarah Chen", []string{"sarah@techcorp.io", "sarah.chen@gmail.com"}, "+1-415-555-0101", "TechCorp", "VP of Engineering", "123 Market St, San Francisco, CA 94105", "Met at KubeCon 2025"},
		{"Marcus Johnson", []string{"marcus.johnson@innovatelab.com"}, "+1-212-555-0102", "InnovateLab", "Senior Developer", "456 Broadway, New York, NY 10013", ""},
		{"Priya Patel", []string{"priya@designstudio.co"}, "+44-20-7946-0103", "Design Studio", "Lead Designer", "10 Downing St, London, UK", "Freelance designer, great work on dashboards"},
		{"Alex Rivera", []string{"alex.rivera@cloudops.net", "alex@personal.net"}, "+1-650-555-0104", "CloudOps", "DevOps Lead", "", ""},
		{"Emma Larsson", []string{"emma.larsson@nordictech.se"}, "+46-8-555-0105", "NordicTech", "Product Manager", "Storgatan 1, Stockholm, Sweden", "Speaks Swedish, English, German"},
		{"Yuki Tanaka", []string{"yuki@tokyodev.jp"}, "+81-3-5555-0106", "TokyoDev", "CTO", "1-1 Shibuya, Tokyo, Japan", ""},
		{"David Kim", []string{"david.kim@startuphq.com"}, "+1-310-555-0107", "StartupHQ", "CEO", "789 Wilshire Blvd, Los Angeles, CA 90017", "YC W24 batch"},
		{"Fatima Al-Hassan", []string{"fatima@menadigital.ae"}, "+971-4-555-0108", "MENA Digital", "Regional Director", "DIFC, Dubai, UAE", ""},
		{"James O'Brien", []string{"james@dublinsoft.ie"}, "+353-1-555-0109", "Dublin Software", "Solutions Architect", "St Stephen's Green, Dublin, Ireland", ""},
		{"Lin Wei", []string{"lin.wei@shenzhenai.cn"}, "+86-755-555-0110", "Shenzhen AI", "ML Engineer", "Nanshan District, Shenzhen, China", "PhD from Tsinghua"},
		{"Maria Garcia", []string{"maria@techlatam.mx"}, "+52-55-555-0111", "TechLatam", "Engineering Manager", "Reforma 222, Mexico City, Mexico", ""},
		{"Oleksandr Kovalenko", []string{"oleks@kyivcode.ua"}, "+380-44-555-0112", "KyivCode", "Backend Developer", "", "Go and Rust expert"},
		{"Aisha Okafor", []string{"aisha@lagostech.ng"}, "+234-1-555-0113", "LagosTech", "Data Scientist", "Victoria Island, Lagos, Nigeria", ""},
		{"Pierre Dubois", []string{"pierre@parisdev.fr", "p.dubois@personal.fr"}, "+33-1-555-0114", "ParisDev", "Frontend Lead", "Rue de Rivoli, Paris, France", "Vue.js contributor"},
		{"Raj Krishnan", []string{"raj@bangaloresoft.in"}, "+91-80-555-0115", "BangaloreSoft", "Tech Lead", "Whitefield, Bangalore, India", "AWS certified"},
		{"Sophie Mueller", []string{"sophie@berlintech.de"}, "+49-30-555-0116", "BerlinTech", "QA Lead", "Friedrichstr, Berlin, Germany", ""},
		{"Carlos Mendez", []string{"carlos@saotechworks.br"}, "+55-11-555-0117", "SaoTechWorks", "Full Stack Developer", "", "Organizes local meetups"},
		{"Nadia Petrov", []string{"nadia@moscowdev.ru"}, "+7-495-555-0118", "MoscowDev", "Security Engineer", "", ""},
		{"Hassan Ali", []string{"hassan@cairotech.eg"}, "+20-2-555-0119", "CairoTech", "Mobile Developer", "Zamalek, Cairo, Egypt", "Flutter specialist"},
		{"Ingrid Johansson", []string{"ingrid@osloinnovate.no"}, "+47-22-555-0120", "Oslo Innovate", "UX Researcher", "Karl Johans gate, Oslo, Norway", ""},
		{"Chen Wei Ming", []string{"weiming@shanghaistartup.cn"}, "+86-21-555-0121", "Shanghai Startup", "Co-founder", "", ""},
		{"Ana Popescu", []string{"ana@bucharestdev.ro"}, "+40-21-555-0122", "BucharestDev", "Database Admin", "", "PostgreSQL expert"},
		{"Tom Wilson", []string{"tom.wilson@acme-hosting.com"}, "+1-800-555-0123", "Acme Hosting", "Support Manager", "123 Cloud St, San Francisco, CA", "Internal contact"},
		{"Lisa Park", []string{"lisa.park@acme-hosting.com"}, "+1-800-555-0124", "Acme Hosting", "HR Director", "123 Cloud St, San Francisco, CA", "Internal contact"},
		{"Mike Thompson", []string{"mike@freelance.dev"}, "+1-503-555-0125", "", "Freelance Consultant", "", "Available for contract work"},
		{"Svetlana Ivanova", []string{"svetlana@spbtech.ru"}, "+7-812-555-0126", "SPB Tech", "Project Manager", "", "PMP certified"},
		{"Juan Rodriguez", []string{"juan@buenosdev.ar"}, "+54-11-555-0127", "BuenosDev", "DevRel", "", "Conference speaker"},
		{"Akiko Sato", []string{"akiko@osakadata.jp"}, "+81-6-5555-0128", "OsakaData", "Data Engineer", "Umeda, Osaka, Japan", "Apache Spark contributor"},
		{"Robert van der Berg", []string{"robert@amsterdamcloud.nl"}, "+31-20-555-0129", "Amsterdam Cloud", "Cloud Architect", "Keizersgracht, Amsterdam, Netherlands", ""},
		{"Grace Mwangi", []string{"grace@nairobitech.ke"}, "+254-20-555-0130", "NairobiTech", "iOS Developer", "Westlands, Nairobi, Kenya", "Swift and SwiftUI"},
	}

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
				"address": email,
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

	// Split into batches of 10 to avoid oversized requests
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

func seedCalendarEvents(c *client) (int, error) {
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

	now := time.Now()
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())

	events := map[string]interface{}{}

	// Daily standup - recurring weekdays at 9:30am for 2 weeks
	events["standup"] = map[string]interface{}{
		"calendarIds": map[string]bool{calendarID: true},
		"title":       "Daily Standup",
		"description": "Quick sync on progress, blockers, and plans for the day.",
		"start":       today.Add(9*time.Hour + 30*time.Minute).Format("2006-01-02T15:04:05"),
		"duration":    "PT15M",
		"timeZone":    "Europe/Stockholm",
		"recurrenceRules": []map[string]interface{}{
			{
				"frequency": "weekly",
				"byDay":     []map[string]interface{}{{"day": "mo"}, {"day": "tu"}, {"day": "we"}, {"day": "th"}, {"day": "fr"}},
				"count":     10,
			},
		},
		"status": "confirmed",
	}

	// One-off meetings
	oneOffs := []struct {
		title    string
		desc     string
		dayOff   int
		hour     int
		min      int
		durMins  int
	}{
		{"Design Review", "Review the latest UI mockups and discuss feedback from user testing.", 1, 14, 0, 60},
		{"Sprint Planning", "Plan stories and tasks for Sprint 25. Bring your estimates.", 2, 10, 0, 90},
		{"1:1 with Manager", "Weekly check-in. Topics: career growth, project updates, team feedback.", 3, 11, 0, 30},
		{"Architecture Review", "Discuss the proposed microservices migration and data layer changes.", 4, 15, 30, 60},
		{"Customer Demo", "Demo the new webmail features to the Acme Corp team.", 5, 13, 0, 45},
		{"Tech Talk: JMAP Protocol", "Internal presentation on JMAP and how it compares to IMAP.", 7, 16, 0, 60},
		{"Team Retrospective", "Sprint retrospective - what went well, what to improve.", 8, 14, 30, 60},
		{"Budget Planning Meeting", "Q2 budget review with finance team.", 9, 10, 0, 60},
		{"Pair Programming Session", "Pair on the email threading implementation with Lin.", 10, 14, 0, 120},
		{"Product Roadmap Review", "Review H2 2026 product roadmap with stakeholders.", 12, 11, 0, 90},
	}

	for i, m := range oneOffs {
		start := today.AddDate(0, 0, m.dayOff).Add(time.Duration(m.hour)*time.Hour + time.Duration(m.min)*time.Minute)
		events[fmt.Sprintf("meeting%d", i)] = map[string]interface{}{
			"calendarIds": map[string]bool{calendarID: true},
			"title":       m.title,
			"description": m.desc,
			"start":       start.Format("2006-01-02T15:04:05"),
			"duration":    fmt.Sprintf("PT%dM", m.durMins),
			"timeZone":    "Europe/Stockholm",
			"status":      "confirmed",
		}
	}

	// All-day events
	events["offsite"] = map[string]interface{}{
		"calendarIds": map[string]bool{calendarID: true},
		"title":       "Company Offsite",
		"description": "Annual company offsite at Grand Hotel. Team building, strategy sessions, and dinner.",
		"start":       today.AddDate(0, 0, 11).Format("2006-01-02T00:00:00"),
		"duration":    "P2D",
		"timeZone":    "Europe/Stockholm",
		"showWithoutTime": true,
		"status":      "confirmed",
	}

	events["holiday"] = map[string]interface{}{
		"calendarIds": map[string]bool{calendarID: true},
		"title":       "Public Holiday - Good Friday",
		"description": "Office closed.",
		"start":       today.AddDate(0, 0, 14).Format("2006-01-02T00:00:00"),
		"duration":    "P1D",
		"timeZone":    "Europe/Stockholm",
		"showWithoutTime": true,
		"status":      "confirmed",
	}

	// Event with attendees
	events["teamlunch"] = map[string]interface{}{
		"calendarIds": map[string]bool{calendarID: true},
		"title":       "Team Lunch",
		"description": "Monthly team lunch at the Italian place.",
		"start":       today.AddDate(0, 0, 6).Add(12 * time.Hour).Format("2006-01-02T15:04:05"),
		"duration":    "PT90M",
		"timeZone":    "Europe/Stockholm",
		"status":      "confirmed",
		"participants": map[string]interface{}{
			"p1": map[string]interface{}{"name": "Sarah Chen", "email": "sarah@techcorp.io", "kind": "individual", "roles": map[string]bool{"attendee": true}},
			"p2": map[string]interface{}{"name": "Marcus Johnson", "email": "marcus.johnson@innovatelab.com", "kind": "individual", "roles": map[string]bool{"attendee": true}},
			"p3": map[string]interface{}{"name": "Priya Patel", "email": "priya@designstudio.co", "kind": "individual", "roles": map[string]bool{"attendee": true}},
			"p4": map[string]interface{}{"name": "Alex Rivera", "email": "alex.rivera@cloudops.net", "kind": "individual", "roles": map[string]bool{"attendee": true}},
		},
	}

	// Yesterday event (past)
	events["yesterday"] = map[string]interface{}{
		"calendarIds": map[string]bool{calendarID: true},
		"title":       "Code Review Session",
		"description": "Review PRs #841, #843, #845 before merge.",
		"start":       today.AddDate(0, 0, -1).Add(15 * time.Hour).Format("2006-01-02T15:04:05"),
		"duration":    "PT60M",
		"timeZone":    "Europe/Stockholm",
		"status":      "confirmed",
	}

	// Earlier today
	events["earlier"] = map[string]interface{}{
		"calendarIds": map[string]bool{calendarID: true},
		"title":       "Morning Coffee Chat",
		"description": "Informal catch-up with the remote team.",
		"start":       today.Add(8 * time.Hour).Format("2006-01-02T15:04:05"),
		"duration":    "PT30M",
		"timeZone":    "Europe/Stockholm",
		"status":      "confirmed",
	}

	// Send in batches of 10
	keys := make([]string, 0, len(events))
	for k := range events {
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
			batch[k] = events[k]
		}

		_, err := c.jmapCall(jmapRequest{
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
		total += len(batch)
	}

	return total, nil
}

// --- Main ---

func main() {
	defaultURL := os.Getenv("STALWART_URL")
	if defaultURL == "" {
		defaultURL = "http://10.10.10.200:8081"
	}

	url := flag.String("url", defaultURL, "Stalwart URL")
	email := flag.String("email", "", "Account to seed (default: seeds both test accounts)")
	password := flag.String("password", "test1234", "Account password")
	clean := flag.Bool("clean", false, "Delete all existing data before seeding")
	flag.Parse()

	accounts := defaultAccounts
	if *email != "" {
		accounts = []account{{Email: *email, Password: *password}}
	}

	for _, acct := range accounts {
		if err := seedAccount(*url, acct, *clean); err != nil {
			fmt.Fprintf(os.Stderr, "Error seeding %s: %v\n", acct.Email, err)
			os.Exit(1)
		}
	}

	fmt.Println("Done!")
}
