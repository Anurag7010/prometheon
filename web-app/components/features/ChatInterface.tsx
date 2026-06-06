"use client";

import React, { useState, useCallback } from "react";
import { useAsk } from "../../hooks/useAsk";
import { MessageBubble } from "../ui/MessageBubble";
import { AsyncBoundary } from "../ui/AsyncBoundary";
import type { Message, Source } from "../../types";

function StreamingBubble({ content }: { content: string }) {
  return (
    <div className="flex justify-start mb-3">
      <div className="max-w-[75%] rounded-2xl bg-muted px-4 py-2 text-sm text-foreground">
        <p className="whitespace-pre-wrap">
          {content || <span className="text-muted-foreground text-xs">Generating...</span>}
          <span className="ml-0.5 inline-block animate-pulse text-foreground">▋</span>
        </p>
      </div>
    </div>
  );
}

export function ChatInterface(): React.ReactElement {
  const { state, messages, askStream, clearHistory, isStreaming } = useAsk();
  const [input, setInput] = useState("");

  const handleSend = useCallback(async () => {
    const query = input.trim();
    if (!query) return;
    setInput("");
    await askStream(query);
  }, [input, askStream]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const isDisabled = isStreaming || state.status === "loading";
  const lastIndex = messages.length - 1;

  return (
    <div className="flex h-full flex-col">
      {/* Message history */}
      <div className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 && (
          <p className="text-center text-sm text-muted-foreground">
            Ask a question to get started
          </p>
        )}
        {messages.map((message: Message, index: number) => {
          // The last assistant message during streaming gets a live cursor instead of
          // the regular bubble — MessageBubble hides empty content so we render inline.
          const isActiveStream =
            isStreaming && index === lastIndex && message.role === "assistant";

          if (isActiveStream) {
            return <StreamingBubble key={index} content={message.content} />;
          }
          return (
            <div key={index}>
              <MessageBubble message={message} />
              {message.role === "assistant" && message.sources && message.sources.length > 0 && (
                <div className="ml-2 mt-2 mb-3 border-t pt-2 text-xs text-muted-foreground max-w-[75%]">
                  <p className="font-medium mb-1">Sources</p>
                  {message.sources.map((source: Source, i: number) => (
                    <div key={i} className="mb-1 truncate">
                      <span className="font-mono">[Source {source.citationId ?? i + 1}]</span>{' '}
                      {source.metadata?.source as string ?? 'Document'}
                      {source.score != null && (
                        <span className="ml-1 opacity-60">{(source.score * 100).toFixed(0)}%</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Bounce dots for non-streaming loading (e.g. ask() fallback path) */}
        {!isStreaming && (
          <AsyncBoundary
            state={state}
            renderLoading={() => (
              <div className="flex justify-start mb-3">
                <div className="rounded-2xl bg-muted px-4 py-2">
                  <div className="flex gap-1">
                    <span className="animate-bounce text-muted-foreground">●</span>
                    <span
                      className="animate-bounce text-muted-foreground"
                      style={{ animationDelay: "0.1s" }}
                    >
                      ●
                    </span>
                    <span
                      className="animate-bounce text-muted-foreground"
                      style={{ animationDelay: "0.2s" }}
                    >
                      ●
                    </span>
                  </div>
                </div>
              </div>
            )}
            renderError={(error) => {
              const isUnavailable = typeof error === 'string' && error.includes('temporarily unavailable')
              if (isUnavailable) {
                return (
                  <div className="flex flex-col items-center gap-2 mt-2">
                    <p className="text-center text-xs text-amber-600">
                      AI service is temporarily unavailable — your documents are safe
                    </p>
                    <button
                      onClick={() => askStream(input || (messages[messages.length - 2]?.content ?? ''))}
                      className="text-xs text-primary underline hover:no-underline"
                    >
                      Retry
                    </button>
                  </div>
                )
              }
              return <p className="text-center text-xs text-red-500 mt-2">{error}</p>
            }}
            renderSuccess={() => null}
            renderIdle={() => null}
          />
        )}
      </div>

      {/* Controls */}
      <div className="border-t border-border p-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isDisabled}
            placeholder="Ask a question..."
            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:bg-muted"
          />

          <button
            onClick={handleSend}
            disabled={isDisabled || !input.trim()}
            className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            Send
          </button>

          {/* Cancel only appears during active streaming */}
          {isStreaming && (
            <button
              onClick={clearHistory}
              className="rounded-lg border border-border px-3 py-2 text-sm text-foreground hover:bg-muted"
            >
              Cancel
            </button>
          )}
        </div>

        {messages.length > 0 && !isStreaming && (
          <button
            onClick={clearHistory}
            className="mt-2 text-xs text-muted-foreground hover:text-foreground"
          >
            Clear history
          </button>
        )}
      </div>
    </div>
  );
}
