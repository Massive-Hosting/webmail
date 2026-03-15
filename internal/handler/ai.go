package handler

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"webmail/internal/config"
	"webmail/internal/middleware"

	"github.com/rs/zerolog"
)

// System prompts for each AI feature.
const (
	systemPromptCompose = "You are an email writing assistant helping the user compose emails. Write the email body only — no subject line. Include an appropriate greeting and sign-off unless told otherwise. The user's identity (name and email) will be provided in the context."
	systemPromptReply   = "You are helping the user write a reply to an email they received. The user's identity and the original email are provided. Write the reply FROM the user TO the original sender. Write only the reply body with an appropriate greeting and sign-off."
	systemPromptRewrite = "Rewrite the following text according to the instruction. Return only the rewritten text."
)

// AIHandler handles AI-powered email composition endpoints.
type AIHandler struct {
	httpClient  *http.Client
	baseURL     string
	apiKey      string
	model       string
	maxTokens   int
	rateLimiter *aiRateLimiter
	log         zerolog.Logger
}

// NewAIHandler creates a new AI handler.
func NewAIHandler(cfg *config.Config, log zerolog.Logger) *AIHandler {
	return &AIHandler{
		httpClient:  &http.Client{Timeout: 120 * time.Second},
		baseURL:     strings.TrimRight(cfg.AIBaseURL, "/"),
		apiKey:      cfg.AIAPIKey,
		model:       cfg.AIModel,
		maxTokens:   cfg.AIMaxTokens,
		rateLimiter: newAIRateLimiter(20, time.Hour),
		log:         log,
	}
}

// --- Rate limiter (20 requests/hour per user) ---

type aiRateLimiter struct {
	mu       sync.Mutex
	buckets  map[string]*aiBucket
	rate     int
	interval time.Duration
}

type aiBucket struct {
	count       int
	windowStart time.Time
}

func newAIRateLimiter(rate int, interval time.Duration) *aiRateLimiter {
	return &aiRateLimiter{
		buckets:  make(map[string]*aiBucket),
		rate:     rate,
		interval: interval,
	}
}

func (rl *aiRateLimiter) allow(key string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	b, ok := rl.buckets[key]
	if !ok || now.Sub(b.windowStart) >= rl.interval {
		rl.buckets[key] = &aiBucket{count: 1, windowStart: now}
		return true
	}
	if b.count >= rl.rate {
		return false
	}
	b.count++
	return true
}

// --- Request/response types ---

type composeRequest struct {
	Prompt  string `json:"prompt"`
	Context string `json:"context"`
	Tone    string `json:"tone"`
}

type replyRequest struct {
	OriginalEmail string `json:"originalEmail"`
	Tone          string `json:"tone"`
	Instruction   string `json:"instruction"`
}

type rewriteRequest struct {
	Text        string `json:"text"`
	Instruction string `json:"instruction"`
}

type aiStatusResponse struct {
	Enabled bool `json:"enabled"`
}

// Status handles GET /api/ai/status.
func (h *AIHandler) Status(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, aiStatusResponse{Enabled: true})
}

// Compose handles POST /api/ai/compose.
func (h *AIHandler) Compose(w http.ResponseWriter, r *http.Request) {
	sess := middleware.SessionFromContext(r.Context())
	if sess == nil {
		writeJSON(w, http.StatusUnauthorized, errorResponse{"unauthorized"})
		return
	}

	if !h.rateLimiter.allow(sess.Email) {
		http.Error(w, `{"error":"ai_rate_limit_exceeded"}`, http.StatusTooManyRequests)
		return
	}

	body, err := io.ReadAll(io.LimitReader(r.Body, 16384))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{"invalid_request"})
		return
	}

	var req composeRequest
	if err := json.Unmarshal(body, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{"invalid_json"})
		return
	}
	if req.Prompt == "" {
		writeJSON(w, http.StatusBadRequest, errorResponse{"prompt_required"})
		return
	}

	// Build user message with tone and context.
	userMsg := req.Prompt
	if req.Tone != "" {
		userMsg = fmt.Sprintf("Tone: %s\n\n%s", req.Tone, userMsg)
	}
	if req.Context != "" {
		userMsg = fmt.Sprintf("%s\n\nContext/previous conversation:\n%s", userMsg, req.Context)
	}

	h.streamResponse(w, r, systemPromptCompose, userMsg)
}

// Reply handles POST /api/ai/reply.
func (h *AIHandler) Reply(w http.ResponseWriter, r *http.Request) {
	sess := middleware.SessionFromContext(r.Context())
	if sess == nil {
		writeJSON(w, http.StatusUnauthorized, errorResponse{"unauthorized"})
		return
	}

	if !h.rateLimiter.allow(sess.Email) {
		http.Error(w, `{"error":"ai_rate_limit_exceeded"}`, http.StatusTooManyRequests)
		return
	}

	body, err := io.ReadAll(io.LimitReader(r.Body, 65536))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{"invalid_request"})
		return
	}

	var req replyRequest
	if err := json.Unmarshal(body, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{"invalid_json"})
		return
	}
	if req.OriginalEmail == "" {
		writeJSON(w, http.StatusBadRequest, errorResponse{"original_email_required"})
		return
	}

	// Build user message.
	userMsg := fmt.Sprintf("Original email:\n---\n%s\n---\n", req.OriginalEmail)
	if req.Tone != "" {
		userMsg += fmt.Sprintf("\nTone: %s", req.Tone)
	}
	if req.Instruction != "" {
		userMsg += fmt.Sprintf("\nInstruction: %s", req.Instruction)
	}

	h.streamResponse(w, r, systemPromptReply, userMsg)
}

// Rewrite handles POST /api/ai/rewrite.
func (h *AIHandler) Rewrite(w http.ResponseWriter, r *http.Request) {
	sess := middleware.SessionFromContext(r.Context())
	if sess == nil {
		writeJSON(w, http.StatusUnauthorized, errorResponse{"unauthorized"})
		return
	}

	if !h.rateLimiter.allow(sess.Email) {
		http.Error(w, `{"error":"ai_rate_limit_exceeded"}`, http.StatusTooManyRequests)
		return
	}

	body, err := io.ReadAll(io.LimitReader(r.Body, 16384))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{"invalid_request"})
		return
	}

	var req rewriteRequest
	if err := json.Unmarshal(body, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{"invalid_json"})
		return
	}
	if req.Text == "" {
		writeJSON(w, http.StatusBadRequest, errorResponse{"text_required"})
		return
	}

	userMsg := fmt.Sprintf("Text to rewrite:\n%s\n\nInstruction: %s", req.Text, req.Instruction)

	h.streamResponse(w, r, systemPromptRewrite, userMsg)
}

// openaiRequest is the payload sent to the OpenAI-compatible chat completions endpoint.
type openaiRequest struct {
	Model     string           `json:"model"`
	Messages  []openaiMessage  `json:"messages"`
	MaxTokens int              `json:"max_tokens"`
	Stream    bool             `json:"stream"`
}

type openaiMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// openaiStreamChunk represents a single SSE chunk from the OpenAI-compatible API.
type openaiStreamChunk struct {
	Choices []struct {
		Delta struct {
			Content string `json:"content"`
		} `json:"delta"`
	} `json:"choices"`
}

// streamResponse sends an SSE stream of AI-generated text.
func (h *AIHandler) streamResponse(w http.ResponseWriter, r *http.Request, systemPrompt, userMessage string) {
	// Set SSE headers.
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	flusher, ok := w.(http.Flusher)
	if !ok {
		writeJSON(w, http.StatusInternalServerError, errorResponse{"streaming_not_supported"})
		return
	}

	// Build the OpenAI-compatible request.
	reqBody := openaiRequest{
		Model: h.model,
		Messages: []openaiMessage{
			{Role: "system", Content: systemPrompt},
			{Role: "user", Content: userMessage},
		},
		MaxTokens: h.maxTokens,
		Stream:    true,
	}

	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		h.log.Error().Err(err).Msg("failed to marshal AI request")
		data, _ := json.Marshal(map[string]string{"error": "internal error"})
		fmt.Fprintf(w, "data: %s\n\n", data)
		flusher.Flush()
		return
	}

	httpReq, err := http.NewRequestWithContext(r.Context(), http.MethodPost, h.baseURL+"/v1/chat/completions", bytes.NewReader(bodyBytes))
	if err != nil {
		h.log.Error().Err(err).Msg("failed to create AI request")
		data, _ := json.Marshal(map[string]string{"error": "internal error"})
		fmt.Fprintf(w, "data: %s\n\n", data)
		flusher.Flush()
		return
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+h.apiKey)

	resp, err := h.httpClient.Do(httpReq)
	if err != nil {
		h.log.Error().Err(err).Msg("AI API request failed")
		data, _ := json.Marshal(map[string]string{"error": "AI generation failed"})
		fmt.Fprintf(w, "data: %s\n\n", data)
		flusher.Flush()
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		errBody, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
		h.log.Error().Int("status", resp.StatusCode).Str("body", string(errBody)).Msg("AI API returned error")
		data, _ := json.Marshal(map[string]string{"error": "AI generation failed"})
		fmt.Fprintf(w, "data: %s\n\n", data)
		flusher.Flush()
		return
	}

	// Read the SSE stream from the upstream API and forward chunks to the client.
	scanner := bufio.NewScanner(resp.Body)
	for scanner.Scan() {
		line := scanner.Text()

		// SSE lines start with "data: ".
		if !strings.HasPrefix(line, "data: ") {
			continue
		}
		payload := strings.TrimPrefix(line, "data: ")

		// End of stream.
		if payload == "[DONE]" {
			break
		}

		var chunk openaiStreamChunk
		if err := json.Unmarshal([]byte(payload), &chunk); err != nil {
			h.log.Warn().Err(err).Str("payload", payload).Msg("failed to parse AI stream chunk")
			continue
		}

		if len(chunk.Choices) > 0 && chunk.Choices[0].Delta.Content != "" {
			data, _ := json.Marshal(map[string]string{"text": chunk.Choices[0].Delta.Content})
			fmt.Fprintf(w, "data: %s\n\n", data)
			flusher.Flush()
		}
	}

	if err := scanner.Err(); err != nil {
		h.log.Error().Err(err).Msg("AI stream read error")
		data, _ := json.Marshal(map[string]string{"error": "AI generation failed"})
		fmt.Fprintf(w, "data: %s\n\n", data)
		flusher.Flush()
		return
	}

	// Send done event.
	fmt.Fprintf(w, "data: %s\n\n", `{"done":true}`)
	flusher.Flush()
}
