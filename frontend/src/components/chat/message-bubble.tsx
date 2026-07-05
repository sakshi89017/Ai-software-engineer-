"use client";

import * as React from "react";
import { useState } from "react";
import { motion } from "framer-motion";
import { Bot, Check, Copy, RotateCcw, User, ThumbsUp, ThumbsDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarkdownMessage } from "@/components/chat/markdown-message";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/types/chat";

interface MessageBubbleProps {
  message: ChatMessage;
  isLastAssistantMessage?: boolean;
  onRegenerate?: () => void;
  canRegenerate?: boolean;
}

export function MessageBubble({
  message,
  isLastAssistantMessage,
  onRegenerate,
  canRegenerate,
}: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const [liked, setLiked] = useState<boolean | null>(null);
  const isUser = message.role === "user";

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}
    >
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
          isUser ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
        }`}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>

      <div className={`group max-w-[85%] space-y-1 ${isUser ? "items-end" : "items-start"} flex flex-col`}>
        <div
          className={`rounded-2xl px-4 py-2.5 ${
            isUser ? "bg-primary text-primary-foreground" : "bg-card border border-border"
          }`}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap text-sm">{message.content}</p>
          ) : (
            <MarkdownMessage content={message.content} />
          )}
        </div>

        {!isUser && (
          <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <Button
              variant="ghost"
              size="sm"
              className={cn("h-7 px-2 text-xs gap-1", liked === true && "text-primary bg-primary/5")}
              onClick={() => setLiked(liked === true ? null : true)}
            >
              <ThumbsUp className="h-3 w-3" />
              Like
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={cn("h-7 px-2 text-xs gap-1", liked === false && "text-destructive bg-destructive/5")}
              onClick={() => setLiked(liked === false ? null : false)}
            >
              <ThumbsDown className="h-3 w-3" />
              Dislike
            </Button>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1" onClick={handleCopy}>
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? "Copied" : "Copy Response"}
            </Button>
            {isLastAssistantMessage && canRegenerate && (
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1" onClick={onRegenerate}>
                <RotateCcw className="h-3 w-3" />
                Regenerate
              </Button>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
