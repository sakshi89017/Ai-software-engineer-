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
  onSelectPrompt?: (prompt: string) => void;
}

export function MessageList({ messages, isStreaming, streamingContent, onRegenerate, onSelectPrompt }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the newest content on every update.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  const lastAssistantIndex = [...messages].map((m) => m.role).lastIndexOf("assistant");

  if (messages.length === 0 && !isStreaming) {
    const skills = [
      "Python", "Java", "JavaScript", "React", "Node", "FastAPI", "SQL", "System Design", "Debugging"
    ];

    const cards = [
      { label: "Explain recursion", text: "Explain the concept of recursion in programming and give a clean example." },
      { label: "Optimize my Python code", text: "How do I optimize performance and memory footprint in Python? Show best practices." },
      { label: "Review my React component", text: "Review my React component for hooks usage, performance issues, and styling errors." },
      { label: "Generate REST API", text: "Generate a FastAPI REST API boilerplate with CRUD endpoints, authentication, and error handling." },
      { label: "Explain Docker", text: "Explain Docker and containerization step-by-step for a beginner software developer." },
      { label: "Create SQL schema", text: "Design an optimized SQL database schema for a multi-tenant e-commerce system." },
    ];

    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-center max-w-2xl mx-auto overflow-y-auto">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Sparkles className="h-7 w-7" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight">👋 Welcome to The AI Software Engineer</h2>
        <p className="mt-2 text-sm text-muted-foreground max-w-md">
          Your expert developer assistant. Ask me anything about programming, database modeling, or architecture design.
        </p>

        {/* Skills Tag Cloud */}
        <div className="mt-5 flex flex-wrap justify-center gap-2 max-w-lg">
          {skills.map((skill) => (
            <span
              key={skill}
              className="px-3 py-1 rounded-full text-xs font-semibold bg-secondary/50 text-secondary-foreground border border-border/60"
            >
              • {skill}
            </span>
          ))}
        </div>

        {/* Quick Suggestion Cards */}
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
          {cards.map((card) => (
            <button
              key={card.label}
              type="button"
              onClick={() => onSelectPrompt?.(card.text)}
              className="flex flex-col text-left p-4 rounded-xl border border-border bg-card hover:border-primary/40 hover:bg-accent/40 transition-all cursor-pointer group"
            >
              <span className="text-xs font-bold text-primary group-hover:underline">
                {card.label}
              </span>
              <span className="text-[11px] text-muted-foreground mt-1 line-clamp-2">
                {card.text}
              </span>
            </button>
          ))}
        </div>
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
