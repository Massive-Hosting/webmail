package handler

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sync"
	"time"

	"webmail/internal/config"
	"webmail/internal/middleware"

	"github.com/anthropics/anthropic-sdk-go"
	"github.com/anthropics/anthropic-sdk-go/option"
	"github.com/rs/zerolog"
)

// System prompts for each AI feature.
const (
	systemPromptCompose = "You are an email writing assistant. Write the email body only, no subject line, no greeting/signature unless asked."
	systemPromptReply   = "You are replying to the email below. Write only the reply body."
	systemPromptRewrite = "Rewrite the following text according to the instruction. Return only the rewritten text."
)

// AIHandler handles AI-powered email composition endpoints.
type AIHandler struct {
	client      anthropic.Client
	model       string
	maxTokens   int64
	rateLimiter *aiRateLimiter
	log         zerolog.Logger
}

// NewAIHandler creates a new AI handler.
func NewAIHandler(cfg *config.Config, log zerolog.Logger) *AIHandler {
	client := anthropic.NewClient(option.WithAPIKey(cfg.AIAPIKey))
	return &AIHandler{
		client:      client,
		model:       cfg.AIModel,
		maxTokens:   int64(cfg.AIMaxTokens),
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
	count     int
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

	stream := h.client.Messages.NewStreaming(r.Context(), anthropic.MessageNewParams{
		Model:     anthropic.Model(h.model),
		MaxTokens: h.maxTokens,
		System: []anthropic.TextBlockParam{
			{Text: systemPrompt},
		},
		Messages: []anthropic.MessageParam{
			anthropic.NewUserMessage(anthropic.NewTextBlock(userMessage)),
		},
	})
	defer stream.Close()

	for stream.Next() {
		evt := stream.Current()
		if evt.Type == "content_block_delta" {
			if evt.Delta.Type == "text_delta" {
				data, _ := json.Marshal(map[string]string{"text": evt.Delta.Text})
				fmt.Fprintf(w, "data: %s\n\n", data)
				flusher.Flush()
			}
		}
	}

	if err := stream.Err(); err != nil {
		h.log.Error().Err(err).Msg("AI stream error")
		data, _ := json.Marshal(map[string]string{"error": "AI generation failed"})
		fmt.Fprintf(w, "data: %s\n\n", data)
		flusher.Flush()
		return
	}

	// Send done event.
	fmt.Fprintf(w, "data: %s\n\n", `{"done":true}`)
	flusher.Flush()
}
