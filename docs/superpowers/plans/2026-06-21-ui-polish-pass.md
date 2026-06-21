# UI Polish Pass — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply 9 targeted UI/UX fixes across landing page, chat, agent, search, and conversation management.

**Architecture:** Frontend-only changes except Task 5 which adds one new Next.js API route (PATCH /api/conversations/[id]). No Python backend changes required.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind CSS v3, framer-motion, ReactMarkdown + remark-gfm, Drizzle ORM

## Global Constraints

- Tailwind CSS MUST stay on v3.x — never upgrade to v4
- Zero `any` types in TypeScript — use `unknown` with type guards
- No hardcoded colors — use CSS variables / brand tokens (`ember-black`, `forge-dark`, `parchment`, `ash-gray`, `ember`, `stone-mid`)
- Run `npx tsc --noEmit` after every task — zero errors required
- All framer-motion animations: ease-out curves (`[0.16, 1, 0.3, 1]`) — no bounce, no elastic
- No side-stripe `border-left`/`border-right` accent borders

---

### Task 1: Image sizes props + hero gradient + StringPoster jitter

**Files:**
- Modify: `web-app/app/(auth)/login/LoginForm.tsx`
- Modify: `web-app/app/(auth)/register/RegisterForm.tsx`
- Modify: `web-app/app/(marketing)/LandingPage.tsx`
- Modify: `web-app/components/marketing/StringPoster.tsx`

**Interfaces:**
- Produces: nothing consumed by other tasks

- [ ] **Step 1: Add `sizes` to LoginForm image**

In `web-app/app/(auth)/login/LoginForm.tsx`, find the `<Image>` with `src="/prometheon-feature-card.jpeg"` and add `sizes="(max-width: 768px) 100vw, 50vw"`.

- [ ] **Step 2: Add `sizes` to RegisterForm image**

In `web-app/app/(auth)/register/RegisterForm.tsx`, find the `<Image>` with `src="/prometheon-feature-card.jpeg"` and add `sizes="(max-width: 768px) 100vw, 50vw"`.

- [ ] **Step 3: Fix hero → StringPoster transition (LandingPage.tsx)**

The page `<main>` element's background between sections looks like a dead gray gap. Find the hero section element (first `<section>` with `h-screen`) and add a decorative div immediately after the closing `</section>` tag of the hero:

```tsx
{/* Warm ember bloom bridging hero to StringPoster */}
<div
  className="pointer-events-none absolute left-0 right-0 h-48 z-10"
  style={{
    top: 'calc(100vh - 4rem)',
    background: 'radial-gradient(ellipse 60% 100% at 50% 0%, rgba(212,87,42,0.07) 0%, transparent 100%)',
  }}
/>
```

Note: the parent `<main>` needs `relative` positioning — add `className="relative"` to `<main>` if it doesn't already have it.

- [ ] **Step 4: Fix StringPoster parallax jitter**

In `web-app/components/marketing/StringPoster.tsx`:

a) Change parallax range to reduce jitter — update `useTransform`:
```tsx
const bgY = useTransform(scrollYProgress, [0, 1], ["0%", "8%"]);
```

b) Replace `<img>` with CSS background on the motion div (no layout reflow). Find the `<motion.div className="absolute inset-0" style={{ y: bgY, height: "120%", top: "-10%" }}>` block and replace its contents:
```tsx
<motion.div
  className="absolute inset-0"
  style={{
    y: bgY,
    height: "120%",
    top: "-10%",
    willChange: "transform",
    backgroundImage: "url('/StringPosterBG.png')",
    backgroundSize: "cover",
    backgroundPosition: "center",
  }}
>
  <div
    className="absolute inset-0"
    style={{
      background:
        "linear-gradient(to bottom, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.42) 40%, rgba(0,0,0,0.72) 100%)",
    }}
  />
</motion.div>
```

- [ ] **Step 5: TypeScript check**

```bash
cd web-app && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add web-app/app/\(auth\)/login/LoginForm.tsx web-app/app/\(auth\)/register/RegisterForm.tsx web-app/app/\(marketing\)/LandingPage.tsx web-app/components/marketing/StringPoster.tsx
git commit -m "fix: image sizes props, hero gradient, StringPoster parallax jitter"
```

---

### Task 2: Search results + SearchResultCard visibility

**Files:**
- Modify: `web-app/app/(app)/search/page.tsx`
- Modify: `web-app/components/search/SearchResultCard.tsx`

**Interfaces:**
- Produces: nothing consumed by other tasks

- [ ] **Step 1: Fix score distribution section in search/page.tsx**

Find the score distribution `<div>` (has class `bg-muted/50 border border-border`). Replace its classes and content:

```tsx
{/* Score distribution */}
<div className="mb-4 p-3 rounded-lg bg-forge-dark/80 border border-stone-mid/30">
  <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-ash-gray mb-2">Score Distribution</p>
  <div className="flex items-end gap-1 h-8">
    {results.map((r, i) => (
      <div
        key={i}
        className={cn(
          'flex-1 rounded-sm transition-all cursor-pointer',
          (r.score ?? 0) >= 0.85 ? 'bg-green-500' :
          (r.score ?? 0) >= 0.7 ? 'bg-yellow-500/80' : 'bg-ember/50',
          selectedResult === r && 'ring-1 ring-ember'
        )}
        style={{ height: `${Math.max((r.score ?? 0) * 100, 8)}%` }}
        onClick={() => setSelectedResult(r)}
        title={`Result ${i + 1}: ${r.score?.toFixed(3)}`}
      />
    ))}
  </div>
  <div className="flex justify-between mt-1">
    <span className="text-[10px] text-ash-gray/60">Result 1</span>
    <span className="text-[10px] text-ash-gray/60">Result {results.length}</span>
  </div>
</div>
```

- [ ] **Step 2: Fix SearchResultCard styling**

In `web-app/components/search/SearchResultCard.tsx`, replace the outer div's classes:

```tsx
<div
  className={cn(
    'rounded-xl border transition-all duration-150 cursor-pointer',
    'bg-forge-dark border-stone-mid/30',
    'hover:border-stone-mid/60 hover:shadow-[0_0_0_1px_rgba(76,85,96,0.4)]',
    isSelected && 'border-ember/50 ring-1 ring-ember/20'
  )}
  onClick={onSelect}
>
```

Fix the index badge, source text, and quality label:
```tsx
<span className="shrink-0 w-6 h-6 rounded-full bg-stone-mid/20 flex items-center justify-center text-xs font-mono text-ash-gray">
  {index + 1}
</span>
<div className="min-w-0">
  <p className="text-xs font-medium text-parchment/80 truncate">{sourceName}</p>
  <p className={cn('text-xs', quality.colorClass)}>
    {quality.label} relevance · {Math.round(score * 100)}%
  </p>
</div>
```

Fix quality colors to use brand-aware tokens:
```tsx
const quality =
  score >= 0.85 ? { label: 'High', colorClass: 'text-green-400', barClass: 'bg-green-500' } :
  score >= 0.7  ? { label: 'Medium', colorClass: 'text-yellow-400', barClass: 'bg-yellow-500' } :
  { label: 'Low', colorClass: 'text-ash-gray', barClass: 'bg-stone-mid/60' }
```

Fix the score bar track:
```tsx
<div className="w-16 h-1.5 bg-stone-mid/30 rounded-full overflow-hidden">
```

Fix content text:
```tsx
<p
  className="text-sm text-parchment/75 leading-relaxed"
  dangerouslySetInnerHTML={{ ... }}
/>
```

Fix the expand button:
```tsx
<button
  onClick={e => { e.stopPropagation(); setExpanded(!expanded) }}
  className="text-xs text-ember hover:underline mt-1"
>
```

- [ ] **Step 3: TypeScript check**

```bash
cd web-app && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add web-app/app/\(app\)/search/page.tsx web-app/components/search/SearchResultCard.tsx
git commit -m "fix: search results visibility — brand-token colors on dark background"
```

---

### Task 3: Response formatting, prose-ai dark mode, and message animations

**Files:**
- Modify: `web-app/styles/globals.css`
- Modify: `web-app/components/agent/AgentStepCard.tsx`
- Modify: `web-app/components/ui/MessageBubble.tsx`
- Modify: `web-app/components/features/AgentInterface.tsx`

**Interfaces:**
- Consumes: `MarkdownMessage` from `@/components/chat/MarkdownMessage`
- Produces: animated `MessageBubble` and `AgentStepCard` used by ChatInterface and AgentInterface

- [ ] **Step 1: Fix prose-ai dark mode text color in globals.css**

Find the `.prose-ai` block in `web-app/styles/globals.css`. Add explicit color overrides after the existing rules so parchment/90 is used for all text on dark background:

```css
.prose-ai {
  color: rgba(237, 232, 224, 0.90);
}
.prose-ai p, .prose-ai li, .prose-ai td {
  color: rgba(237, 232, 224, 0.85);
}
.prose-ai h1, .prose-ai h2, .prose-ai h3 {
  color: rgba(237, 232, 224, 0.95);
}
.prose-ai strong {
  color: rgba(237, 232, 224, 1);
  font-weight: 600;
}
.prose-ai a {
  color: #D4572A;
}
.prose-ai code {
  color: rgba(237, 232, 224, 0.85);
  background: rgba(76, 85, 96, 0.35);
  border-color: rgba(76, 85, 96, 0.5);
}
```

- [ ] **Step 2: Add MarkdownMessage to AgentStepCard finalAnswer**

In `web-app/components/agent/AgentStepCard.tsx`, add the import at the top:
```tsx
import { MarkdownMessage } from '@/components/chat/MarkdownMessage'
```

Find the finalAnswer block:
```tsx
{step.finalAnswer && (
  <div className="rounded-lg bg-ember/5 border border-ember/20 px-3 py-2">
    <p className="text-sm text-parchment/90 leading-relaxed">{step.finalAnswer}</p>
  </div>
)}
```

Replace with:
```tsx
{step.finalAnswer && (
  <div className="rounded-lg bg-ember/5 border border-ember/20 px-4 py-3">
    <MarkdownMessage content={step.finalAnswer} />
  </div>
)}
```

- [ ] **Step 3: Add entrance animation to MessageBubble**

In `web-app/components/ui/MessageBubble.tsx`, add `motion` import:
```tsx
import { motion } from 'framer-motion'
```

Wrap the outermost `<div className={cn('group flex gap-3', ...)}>` with `motion.div`:
```tsx
<motion.div
  className={cn('group flex gap-3', isUser && 'flex-row-reverse')}
  initial={{ opacity: 0, y: 8 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
  onMouseEnter={() => setShowActions(true)}
  onMouseLeave={() => setShowActions(false)}
>
```

Also improve the typing cursor: find `<span className="inline-block w-0.5 h-4 bg-ember ml-0.5 animate-pulse align-middle" />` and replace with:
```tsx
<motion.span
  className="inline-block w-0.5 h-[1.1em] bg-ember ml-0.5 align-middle rounded-full"
  animate={{ scaleY: [1, 0.3, 1] }}
  transition={{ duration: 0.9, repeat: Infinity, ease: 'easeInOut' }}
/>
```

- [ ] **Step 4: Add staggered step reveal to AgentInterface**

In `web-app/components/features/AgentInterface.tsx`, add `motion` import if not present:
```tsx
import { motion, AnimatePresence } from 'framer-motion'
```

Find the reasoning trace map:
```tsx
{steps.map((step, i) => (
  <AgentStepCard
    key={step.stepNumber}
    step={step}
    isLast={i === steps.length - 1 && !isRunning}
  />
))}
```

Replace with staggered reveal:
```tsx
{steps.map((step, i) => (
  <motion.div
    key={step.stepNumber}
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{
      duration: 0.4,
      delay: i * 0.08,
      ease: [0.16, 1, 0.3, 1],
    }}
  >
    <AgentStepCard
      step={step}
      isLast={i === steps.length - 1 && !isRunning}
    />
  </motion.div>
))}
```

Also improve the thinking indicator. Find `<span className="text-xs text-ash-gray animate-pulse">Thinking...</span>` and replace:
```tsx
<div className="flex items-center gap-2">
  <span className="text-xs text-ash-gray">Thinking</span>
  <div className="flex gap-1">
    {[0, 1, 2].map((i) => (
      <motion.span
        key={i}
        className="w-1 h-1 rounded-full bg-ember/60"
        animate={{ opacity: [0.3, 1, 0.3] }}
        transition={{ duration: 1, repeat: Infinity, delay: i * 0.2, ease: 'easeInOut' }}
      />
    ))}
  </div>
</div>
```

- [ ] **Step 5: Fix AgentStepCard observation/input section contrast**

In `web-app/components/agent/AgentStepCard.tsx`, the Input and Result panels use `bg-muted/50` and `bg-muted/30` — low contrast on `ember-black`. Replace:

```tsx
{/* Tool input */}
{step.actionInput && Object.keys(step.actionInput).length > 0 && (
  <div className="rounded-lg bg-forge-dark border border-stone-mid/30 overflow-hidden">
    <div className="px-3 py-1.5 border-b border-stone-mid/20">
      <span className="text-[10px] font-medium uppercase tracking-[0.15em] text-ash-gray">Input</span>
    </div>
    <pre className="px-3 py-2 text-xs font-mono overflow-x-auto text-parchment/70">
      {JSON.stringify(step.actionInput, null, 2)}
    </pre>
  </div>
)}

{/* Observation */}
{step.observation && (
  <div className="rounded-lg bg-forge-dark/60 border border-stone-mid/20 overflow-hidden">
    <div className="px-3 py-1.5 border-b border-stone-mid/20 flex items-center justify-between">
      <span className="text-[10px] font-medium uppercase tracking-[0.15em] text-ash-gray">Result</span>
      {hasMoreObservation && (
        <button
          onClick={() => setShowFullObservation(!showFullObservation)}
          className="text-[10px] text-ember hover:underline"
        >
          {showFullObservation ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
    <pre className="px-3 py-2 text-xs font-mono overflow-x-auto text-parchment/65 whitespace-pre-wrap">
      {showFullObservation ? step.observation : observationPreview}
      {!showFullObservation && hasMoreObservation && '...'}
    </pre>
  </div>
)}
```

- [ ] **Step 6: TypeScript check**

```bash
cd web-app && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add web-app/styles/globals.css web-app/components/agent/AgentStepCard.tsx web-app/components/ui/MessageBubble.tsx web-app/components/features/AgentInterface.tsx
git commit -m "feat: markdown rendering in agent, prose-ai dark mode, entrance animations, step card contrast"
```

---

### Task 4: Conversation loading from sidebar + auto-title + rename

**Files:**
- Create: `web-app/app/api/conversations/[id]/route.ts`
- Modify: `web-app/hooks/useAsk.ts`
- Modify: `web-app/components/features/ChatInterface.tsx`
- Modify: `web-app/components/chat/ConversationSidebar.tsx`

**Interfaces:**
- Produces:
  - `loadHistory(messages: Message[]): void` on `useAsk` return value
  - `PATCH /api/conversations/[id]` accepting `{ title: string }`

- [ ] **Step 1: Create PATCH route for conversation rename**

Create `web-app/app/api/conversations/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import {
  compose,
  withErrorHandler,
  withRequestId,
  withLogging,
  withAuth,
} from '@/lib/middleware'
import { RequestContext } from '@/lib/middleware/types'
import { updateConversationTitle, findConversationById } from '@/db/repositories/conversations'

async function patchHandler(
  req: NextRequest,
  context: RequestContext & { params: { id: string } }
): Promise<NextResponse> {
  const { userId } = context
  if (!userId) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 })
  }

  if (
    !body ||
    typeof body !== 'object' ||
    !('title' in body) ||
    typeof (body as { title: unknown }).title !== 'string'
  ) {
    return NextResponse.json({ error: 'title is required and must be a string' }, { status: 422 })
  }

  const title = ((body as { title: string }).title).trim().slice(0, 100)
  if (!title) {
    return NextResponse.json({ error: 'title must not be empty' }, { status: 422 })
  }

  const conversation = await findConversationById(context.params.id, userId)
  if (!conversation) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
  }

  await updateConversationTitle(context.params.id, userId, title)
  return NextResponse.json({ id: context.params.id, title })
}

type RouteProps = { params: Promise<{ id: string }> }

const wrappedPatch = compose(
  withErrorHandler, withRequestId, withLogging, withAuth({ required: true })
)(
  (req, ctx) => patchHandler(req, ctx as RequestContext & { params: { id: string } })
)

export async function PATCH(req: NextRequest, { params }: RouteProps) {
  const resolvedParams = await params
  return wrappedPatch(req, { requestId: '', startTime: 0, params: resolvedParams } as unknown as RequestContext)
}
```

- [ ] **Step 2: Add loadHistory to useAsk hook**

In `web-app/hooks/useAsk.ts`, update the return type signature and add the function.

Update return type:
```typescript
export function useAsk(): {
  state: AsyncState<AskResponse>
  messages: Message[]
  ask: (query: string) => Promise<void>
  askStream: (query: string) => Promise<void>
  clearHistory: () => void
  loadHistory: (msgs: Message[]) => void
  isStreaming: boolean
}
```

Add `loadHistory` callback after `clearHistory`:
```typescript
const loadHistory = useCallback((msgs: Message[]) => {
  if (flushTimer.current) {
    clearTimeout(flushTimer.current)
    flushTimer.current = null
  }
  tokenBuffer.current = ''
  setMessages(msgs)
  setIsStreaming(false)
  reset()
}, [reset])
```

Add it to the return object:
```typescript
return { state, messages, ask, askStream, clearHistory, loadHistory, isStreaming }
```

- [ ] **Step 3: Load messages when conversation is selected + auto-title**

In `web-app/components/features/ChatInterface.tsx`:

a) Update the destructure of `useAsk`:
```tsx
const { state, messages, askStream, clearHistory, loadHistory, isStreaming } = useAsk()
```

b) Add a `useEffect` to load messages when `conversationId` changes. Place after the scroll effect:
```tsx
useEffect(() => {
  if (!conversationId) return
  let cancelled = false
  async function fetchMessages() {
    const token = getAccessToken()
    const res = await fetch(`/api/conversations/${conversationId}/messages`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (!res.ok || cancelled) return
    const data: unknown = await res.json()
    if (
      data &&
      typeof data === 'object' &&
      'messages' in data &&
      Array.isArray((data as { messages: unknown }).messages)
    ) {
      const raw = (data as { messages: Array<{ role: string; content: string }> }).messages
      const loaded: Message[] = raw.map((m) => ({
        role: m.role as Message['role'],
        content: m.content,
      }))
      loadHistory(loaded)
    }
  }
  fetchMessages()
  return () => { cancelled = true }
}, [conversationId, loadHistory])
```

c) Add auto-title helper. After `ensureConversation` function, add:
```tsx
async function autoTitle(convId: string, firstUserMessage: string) {
  const title = firstUserMessage.trim().slice(0, 45)
  const token = getAccessToken()
  await fetch(`/api/conversations/${convId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ title }),
  })
}
```

d) In `handleSubmit`, after `askStream(q)` resolves, check if this is the first message and trigger auto-title:
```tsx
async function handleSubmit() {
  if (!query.trim() || isStreaming) return
  const q = query.trim()
  setQuery('')
  const convId = await ensureConversation()
  const isFirstMessage = messages.length === 0
  await askStream(q)
  if (isFirstMessage && convId) {
    autoTitle(convId, q)
  }
}
```

- [ ] **Step 4: Add inline rename to ConversationSidebar**

In `web-app/components/chat/ConversationSidebar.tsx`, add state and rename logic.

Add imports:
```tsx
import { useRef } from 'react'
```

Add state inside `ConversationSidebar`:
```tsx
const [renamingId, setRenamingId] = useState<string | null>(null)
const [renameValue, setRenameValue] = useState('')
const renameInputRef = useRef<HTMLInputElement>(null)
```

Add rename handler:
```tsx
async function commitRename(id: string) {
  const trimmed = renameValue.trim()
  setRenamingId(null)
  if (!trimmed) return
  const token = getAccessToken()
  await fetch(`/api/conversations/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ title: trimmed }),
  })
  loadConversations()
}
```

Replace the conversation button with rename-aware version:
```tsx
{renamingId === convo.id ? (
  <input
    ref={renameInputRef}
    value={renameValue}
    onChange={e => setRenameValue(e.target.value)}
    onBlur={() => commitRename(convo.id)}
    onKeyDown={e => {
      if (e.key === 'Enter') commitRename(convo.id)
      if (e.key === 'Escape') setRenamingId(null)
    }}
    className="flex-1 bg-transparent text-sm text-parchment outline-none border-b border-ember/60 pb-0.5"
    autoFocus
  />
) : (
  <button
    key={convo.id}
    onClick={() => onSelect(convo.id)}
    onDoubleClick={() => {
      setRenamingId(convo.id)
      setRenameValue(convo.title)
    }}
    className={cn(
      'w-full text-left px-3 py-2 rounded-lg text-sm transition-all duration-150',
      'flex items-start gap-2',
      currentConversationId === convo.id
        ? 'bg-ember/12 text-parchment font-medium'
        : 'text-ash-gray hover:bg-stone-mid/15 hover:text-parchment',
    )}
  >
    <svg viewBox="0 0 16 16" className="size-3.5 mt-0.5 shrink-0 opacity-60 fill-none stroke-current" strokeWidth="1.2">
      <path d="M2 3h12v9H9l-3 2v-2H2z" />
    </svg>
    <span className="truncate flex-1">{convo.title}</span>
  </button>
)}
```

- [ ] **Step 5: TypeScript check**

```bash
cd web-app && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add web-app/app/api/conversations/\[id\]/route.ts web-app/hooks/useAsk.ts web-app/components/features/ChatInterface.tsx web-app/components/chat/ConversationSidebar.tsx
git commit -m "feat: load conversation messages on select, auto-title, inline rename"
```

---

### Task 5: Quick access badges + improved suggested questions

**Files:**
- Modify: `web-app/components/features/AgentInterface.tsx`
- Modify: `web-app/components/features/ChatInterface.tsx`

**Interfaces:**
- Consumes: `setQuery` state setter and `ChatInput` focus ref (if needed)
- Produces: nothing consumed by other tasks

- [ ] **Step 1: Make agent tool badges clickable query templates**

In `web-app/components/features/AgentInterface.tsx`, update `TOOL_BADGES` array to include `template` strings:

```tsx
const TOOL_BADGES = [
  {
    label: 'Search docs',
    template: 'Search my documents for ',
    icon: ( /* keep existing SVG */ ),
  },
  {
    label: 'List files',
    template: 'List all my documents with their names and chunk counts',
    icon: ( /* keep existing SVG */ ),
  },
  {
    label: 'Calculate',
    template: 'Calculate ',
    icon: ( /* keep existing SVG */ ),
  },
  {
    label: 'Web search',
    template: 'Search the web for ',
    icon: ( /* keep existing SVG */ ),
  },
  {
    label: 'Get metadata',
    template: 'Get metadata for my document ',
    icon: ( /* keep existing SVG */ ),
  },
]
```

Add a ref for the ChatInput so we can focus it:
```tsx
const inputRef = useRef<HTMLInputElement>(null)
```

Pass `inputRef` to `ChatInput` — update `ChatInput` interface to accept `inputRef?: React.RefObject<HTMLInputElement>` and forward it to the underlying `<textarea>` or `<input>`. (If `ChatInput` uses a textarea, use `useRef<HTMLTextAreaElement>` instead — check the component.)

Update the badge render — remove `cursor-default pointer-events-none` and add click handler:
```tsx
{TOOL_BADGES.map((badge, i) => (
  <motion.button
    key={badge.label}
    initial={{ opacity: 0, y: 6 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.4, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }}
    onClick={() => {
      if (isRunning) return
      setQuery(badge.template)
    }}
    disabled={isRunning}
    className={cn(
      'flex items-center gap-1.5 bg-forge-dark border border-stone-mid/50 rounded-full px-3 py-1.5',
      'text-parchment/70 text-xs font-medium transition-all duration-150',
      'hover:border-ember/50 hover:text-parchment hover:bg-stone-mid/10',
      'disabled:opacity-40 disabled:cursor-not-allowed',
    )}
  >
    {badge.icon}
    {badge.label}
  </motion.button>
))}
```

- [ ] **Step 2: Replace ChatInterface SUGGESTED_QUESTIONS**

In `web-app/components/features/ChatInterface.tsx`, replace `SUGGESTED_QUESTIONS`:

```tsx
const SUGGESTED_QUESTIONS = [
  {
    title: 'What are the key arguments and conclusions?',
    subtitle: 'Get a structured summary of the main claims and what they support',
  },
  {
    title: 'Compare ideas across all my documents',
    subtitle: 'Find similarities, differences, and contradictions between sources',
  },
  {
    title: 'Find every mention of a topic with citations',
    subtitle: 'Locate specific references and trace them back to exact sources',
  },
  {
    title: 'Explain the most complex concept simply',
    subtitle: 'Break down technical material into plain language with examples',
  },
]
```

- [ ] **Step 3: Replace AgentInterface SUGGESTED_QUERIES**

In `web-app/components/features/AgentInterface.tsx`, replace `SUGGESTED_QUERIES`:

```tsx
const SUGGESTED_QUERIES = [
  {
    label: 'Document inventory',
    query: 'List all my documents with their names and chunk counts',
  },
  {
    label: 'Research + web update',
    query: 'Search my documents for the main topic, then check the web for the latest developments on it',
  },
  {
    label: 'Cross-document analysis',
    query: 'Search across all my documents and find the most important recurring themes',
  },
  {
    label: 'Fact check with sources',
    query: 'What specific claims are made in my documents and what evidence supports them?',
  },
]
```

- [ ] **Step 4: No ref forwarding needed**

`ChatInput` uses an internal `textareaRef` that auto-focuses on mount. Badge click sets `query` state, which updates the `value` prop — the textarea already has content and the user can submit immediately. No `forwardRef` changes required.

- [ ] **Step 5: TypeScript check**

```bash
cd web-app && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add web-app/components/features/AgentInterface.tsx web-app/components/features/ChatInterface.tsx
git commit -m "feat: clickable tool badges, domain-specific suggested questions"
```

---

## Post-implementation verification

After all tasks complete:

```bash
cd web-app && npx tsc --noEmit && npm test
```

Manual smoke test:
1. Visit `/login` — no browser image warnings
2. Visit `/` — no gray gap below hero, StringPoster scrolls smoothly
3. Visit `/search`, run a query — score distribution and cards are legible
4. Visit `/chat` — message bubbles animate in, markdown renders correctly
5. Send a message — conversation appears in sidebar with auto-generated title
6. Click old conversation — messages load
7. Double-click conversation title — inline rename works
8. Visit `/agent` — tool badges are clickable, steps animate on reveal, final answer renders markdown
