'use client'

import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/cn'

interface MarkdownMessageProps {
  content: string
  className?: string
}

export function MarkdownMessage({ content, className }: MarkdownMessageProps) {
  return (
    <div className={cn('prose-ai', className)}>
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code({ className: codeClass, children, ...props }) {
          const match = /language-(\w+)/.exec(codeClass || '')
          const code = String(children).replace(/\n$/, '')
          const isBlock = Boolean(match)

          if (isBlock) {
            return (
              <div className="relative my-3">
                <div className="flex items-center justify-between px-4 py-2 bg-muted/80 border-b border-border rounded-t-lg">
                  <span className="text-xs font-mono text-muted-foreground">{match?.[1]}</span>
                  <CopyButton text={code} />
                </div>
                <pre className="m-0 rounded-t-none rounded-b-lg">
                  <code className={codeClass} {...props}>{children}</code>
                </pre>
              </div>
            )
          }

          return (
            <code
              className="font-mono text-[0.8em] bg-muted px-1.5 py-0.5 rounded border border-border/50"
              {...props}
            >
              {children}
            </code>
          )
        },

        table({ children }) {
          return (
            <div className="overflow-x-auto my-3">
              <table className="w-full text-sm border-collapse">{children}</table>
            </div>
          )
        },
        th({ children }) {
          return (
            <th className="px-3 py-2 text-left font-semibold bg-muted border border-border text-xs uppercase tracking-wide">
              {children}
            </th>
          )
        },
        td({ children }) {
          return <td className="px-3 py-2 border border-border">{children}</td>
        },

        blockquote({ children }) {
          return (
            <blockquote className="border-l-2 border-brand pl-4 my-3 text-muted-foreground italic">
              {children}
            </blockquote>
          )
        },

        a({ href, children }) {
          return (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand underline underline-offset-4 hover:opacity-80 transition-opacity"
            >
              {children}
            </a>
          )
        },
      }}
    >
      {content}
    </ReactMarkdown>
    </div>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={copy}
      className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
    >
      {copied ? '✓ Copied' : 'Copy'}
    </button>
  )
}
