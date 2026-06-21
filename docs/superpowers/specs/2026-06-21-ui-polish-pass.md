# UI Polish Pass — Design Spec

**Date:** 2026-06-21

## Scope

Nine targeted fixes across the marketing landing page, chat/agent product UI, conversation management, and search results. No backend streaming changes — agent streaming is a frontend-only staggered reveal.

## Fix Inventory

### 1. Image `sizes` prop
`LoginForm.tsx` and `RegisterForm.tsx` both have a `fill` Next.js Image without `sizes`. Add `sizes="(max-width: 768px) 100vw, 50vw"`.

### 2. Hero gradient
The gap between the hero card and the StringPoster section shows raw dark page background. Add a warm ember radial glow (`rgba(212,87,42,0.04)`) bleeding downward from the hero to make the transition feel designed.

### 3. StringPoster jitter
Replace the `<img>` element with a CSS `background-image` on the motion div (eliminates layout reflow during scroll). Reduce the parallax range from `0%→20%` to `0%→8%`. The parallax div already has `style={{ y: bgY }}` — add `will-change: transform` via inline style.

### 4 & 5. Search results visibility
The score distribution section uses `bg-muted/50` and `text-muted-foreground` which renders near-invisible on dark backgrounds. Fix: `bg-forge-dark/60`, label text to `text-ash-gray`, score bar track to `bg-stone-mid/20`, fill to ember-colored. `SearchResultCard` uses `bg-card` / `text-foreground` — remap to brand tokens.

### 6. Response formatting + agent animations
- `AgentStepCard` finalAnswer renders as plain `<p>`. Replace with `<MarkdownMessage>`.
- `globals.css` `.prose-ai` block: add explicit `color: var(--parchment)` so dark background doesn't wash it out.
- Agent step reveal: on `isRunning` → false, mount each `AgentStepCard` with `initial={{ opacity:0, y:8 }}` / `animate={{ opacity:1, y:0 }}` and 80ms stagger.
- Chat message bubbles: wrap each `MessageBubble` in a `motion.div` with the same entrance.

### 7. Conversation navigation + rename
- **Bug**: `handleSelectConversation` calls `clearHistory()` and `setConversationId(id)` but never fetches messages. Fix: `useEffect` in `ChatInterface` watching `conversationId` — fetch `/api/conversations/[id]/messages`, deserialize to `Message[]`, inject via new `loadHistory()` on `useAsk`.
- **Auto-title**: after first assistant reply on a new conversation, PATCH `/api/conversations/[id]` with title = first 45 chars of the user's first message.
- **Rename**: New `PATCH /api/conversations/[id]` route. Double-click a sidebar item to enter inline edit (`<input>`). On blur/Enter, call PATCH and refresh sidebar.

### 8. Quick access badges
Remove `pointer-events-none cursor-default`. Clicking a badge populates the query input with a template string and focuses it:
- Search docs → `"Search my documents for "`
- List files → `"List all my documents with their chunk counts"`
- Calculate → `"Calculate "`
- Web search → `"Search the web for "`
- Get metadata → `"Get metadata for my document "`

### 9. Suggested questions
**Chat** (4 questions, capability-demonstrating):
1. "What are the key arguments and conclusions in my documents?"
2. "Compare and contrast the main ideas across all uploaded documents"
3. "Find every mention of a specific topic and cite the exact sources"
4. "Explain the most complex concept in plain language with examples"

**Agent** (4 questions, tool-showcasing):
1. "List all my documents with their names and chunk counts"
2. "Search my documents for [topic] then check the web for recent updates on it"
3. "What is the total character count across all my uploaded documents?"
4. "Which document is most relevant to machine learning and why?"
