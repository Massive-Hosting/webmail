# AI Email Assistant

## Vision

An integrated AI assistant that helps users write, reply to, and manage emails. Accessible from the compose window and reading pane. Uses the Claude API (Anthropic SDK) for language generation.

## Features

### Phase 1 — Compose Assistance

**Smart Reply Suggestions**
- When viewing an email, show 2-3 suggested reply tones: "Professional", "Friendly", "Brief"
- Click a suggestion → opens compose with AI-generated reply pre-filled
- User can edit before sending

**Compose Helper (inline)**
- Button in compose toolbar: "AI Assist" (sparkle icon)
- Click → side panel or inline prompt appears
- User describes what they want: "Write a polite decline to this meeting invitation"
- AI generates the email body
- Insert into editor with one click
- Options: adjust tone (formal/casual), make shorter/longer, translate

**Rewrite Selection**
- Select text in the compose editor
- Right-click or toolbar button → "Rewrite with AI"
- Options: "Make professional", "Make concise", "Fix grammar", "Translate to..."
- Preview the rewrite before replacing

### Phase 2 — Reading Assistance

**Email Summary**
- Long emails or threads get a "Summarize" button
- AI generates a 2-3 sentence summary
- Shown in a collapsible card above the email body

**Action Item Extraction**
- AI scans the email for action items, deadlines, questions
- Shows them as a checklist: "Review the Q4 budget by Friday"
- Option to create calendar events from detected dates

### Phase 3 — Smart Features

**Subject Line Generator**
- When composing, suggest subject lines based on the body content
- "Generate subject" button next to the subject field

**Contact Context**
- When composing to someone, show recent email history summary
- "You last emailed Alice 3 days ago about the design review"

**Email Categorization**
- Auto-suggest folders/labels for incoming mail
- "This looks like a newsletter — move to Newsletters?"

## Architecture

```
Browser (React)
  |
  |-- POST /api/ai/compose  {prompt, context, tone}
  |-- POST /api/ai/reply    {emailBody, tone}
  |-- POST /api/ai/rewrite  {text, instruction}
  |-- POST /api/ai/summarize {emailBody}
  |
Webmail API (Go)
  |
  |-- Anthropic Claude API (via SDK)
  |   API key from env: AI_API_KEY
  |   Model: claude-sonnet-4-20250514 (fast, cheap)
  |
  |-- System prompts per feature
  |-- Streaming responses (SSE) for real-time generation
```

### Backend Endpoints

**POST /api/ai/compose**
```json
{
  "prompt": "Write a polite follow-up about the proposal",
  "context": "Previous email thread text...",
  "tone": "professional",
  "language": "en"
}
```
Response: SSE stream of generated text

**POST /api/ai/reply**
```json
{
  "originalEmail": "Hi, can we reschedule...",
  "tone": "friendly",
  "instruction": "Accept and suggest Thursday instead"
}
```

**POST /api/ai/rewrite**
```json
{
  "text": "hey can u send me that thing",
  "instruction": "professional"
}
```

**POST /api/ai/summarize**
```json
{
  "emailBody": "Long email text...",
  "threadMessages": ["msg1...", "msg2..."]
}
```

### Frontend Components

**ComposeAIPanel** (`src/components/mail/compose/ai-panel.tsx`)
- Side panel or dropdown in compose toolbar
- Text input for instructions
- Tone selector (Professional / Friendly / Concise / Creative)
- "Generate" button
- Streaming response display
- "Insert" / "Replace" / "Discard" buttons

**SmartReplyBar** (`src/components/mail/smart-reply-bar.tsx`)
- Row of 3 suggested reply buttons below email in reading pane
- Each generates a different tone of reply
- Click → opens compose with pre-filled body

**RewritePopover** (`src/components/mail/compose/rewrite-popover.tsx`)
- Appears when text is selected in editor
- Quick rewrite options as buttons
- Shows preview of rewritten text

**SummaryCard** (`src/components/mail/summary-card.tsx`)
- Collapsible card above long emails
- "Summarize with AI" button
- Shows summary when generated

### Configuration

```
AI_API_KEY=sk-ant-...           # Anthropic API key
AI_MODEL=claude-sonnet-4-20250514  # Model to use
AI_MAX_TOKENS=1024              # Max response tokens
AI_ENABLED=true                 # Feature flag
```

Per-user setting in webmail preferences:
- Enable/disable AI features
- Default tone preference
- Language preference

### Security & Privacy

- Email content sent to Claude API for processing — document this clearly
- Users can disable AI features entirely
- No email content is stored by the AI service
- API key stored server-side, never exposed to browser
- Rate limit AI requests: 20/hour per user
- Streaming responses for real-time UX (no waiting for full response)

### Cost Management

- Use claude-sonnet-4-20250514 (cheapest capable model)
- Cache common rewrites/suggestions
- Limit context window (don't send entire thread history for a simple rewrite)
- Track usage per user for billing/limits

## Implementation Priority

1. **Compose helper** (highest value — helps users write better emails)
2. **Smart reply suggestions** (quick wins for common responses)
3. **Rewrite selection** (polish existing text)
4. **Email summarization** (helps with long threads)
5. **Action item extraction** (nice to have)
