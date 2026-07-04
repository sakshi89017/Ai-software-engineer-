"use client";

import * as React from "react";
import { useEffect, useRef } from "react";
import { Sparkles } from "lucide-react";
import { MessageBubble } from "@/components/chat/message-bubble";
import { MarkdownMessage } from "@/components/chat/markdown-message";
import { TypingIndicator } from "@/components/chat/typing-indicator";
import type { ChatMessage } from "@/types/chat";

interface MessageListProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  streamingContent: string;
  onRegenerate: () => void;
}

export function MessageList({ messages, isStreaming, streamingContent, onRegenerate }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the newest content on every update.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  const lastAssistantIndex = [...messages].map((m) => m.role).lastIndexOf("assistant");

  if (messages.length === 0 && !isStreaming) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-center">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Sparkles className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-semibold">Ask DevPilot AI anything</h2>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          Debugging, architecture, code review, algorithms — start typing below.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
      {messages.map((message, index) => (
        <MessageBubble
          key={message.id}
          message={message}
          isLastAssistantMessage={index === lastAssistantIndex}
          canRegenerate={!isStreaming}
          onRegenerate={onRegenerate}
        />
      ))}

      {isStreaming && streamingContent && (
        <div className="flex gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="max-w-[85%] rounded-2xl border border-border bg-card px-4 py-2.5">
            <MarkdownMessage content={streamingContent} />
          </div>
        </div>
      )}

      {isStreaming && !streamingContent && <TypingIndicator />}

      <div ref={bottomRef} />
    </div>
  );
}
