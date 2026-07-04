"use client";

import * as React from "react";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { MessageList } from "@/components/chat/message-list";
import { ChatInput } from "@/components/chat/chat-input";
import { useChat } from "@/hooks/use-chat";

interface ChatViewProps {
  chatId: string | null;
  initialAttachedFile?: { id: string; name: string } | null;
}

export function ChatView({ chatId, initialAttachedFile = null }: ChatViewProps) {
  const { messages, isLoadingChat, isStreaming, streamingContent, sendMessage, regenerate, stopGeneration } =
    useChat({ chatId });
  const [attachedFile, setAttachedFile] = useState(initialAttachedFile);

  const handleSend = (content: string) => {
    sendMessage(content, attachedFile?.id);
    // A file is only attached to the next single message, matching how
    // most chat-with-file UIs behave (avoids resending the same file
    // content on every subsequent turn in the conversation).
    setAttachedFile(null);
  };

  if (isLoadingChat) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <MessageList
          messages={messages}
          isStreaming={isStreaming}
          streamingContent={streamingContent}
          onRegenerate={regenerate}
        />
      </div>
      <ChatInput
        onSend={handleSend}
        onStop={stopGeneration}
        isStreaming={isStreaming}
        attachedFile={attachedFile}
        onRemoveAttachment={() => setAttachedFile(null)}
      />
    </div>
  );
}
