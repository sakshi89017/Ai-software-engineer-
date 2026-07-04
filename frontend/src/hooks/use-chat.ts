"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { chatService } from "@/services/chat-service";
import type { ChatMessage, ChatStreamEvent } from "@/types/chat";

interface UseChatOptions {
  chatId: string | null;
}

export function useChat({ chatId }: UseChatOptions) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoadingChat, setIsLoadingChat] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const abortControllerRef = useRef<AbortController | null>(null);

  // Load an existing chat's messages when chatId changes.
  useEffect(() => {
    if (!chatId) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    setIsLoadingChat(true);
    chatService
      .getChat(chatId)
      .then((chat) => {
        if (!cancelled) setMessages(chat.messages);
      })
      .catch(() => {
        if (!cancelled) toast.error("Could not load this conversation.");
      })
      .finally(() => {
        if (!cancelled) setIsLoadingChat(false);
      });
    return () => {
      cancelled = true;
    };
  }, [chatId]);

  const makeTempMessage = useCallback(
    (role: "user" | "assistant", content: string): ChatMessage => ({
      id: `temp-${role}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      chat_id: chatId || "pending",
      role,
      content,
      token_count: 0,
      created_at: new Date().toISOString(),
    }),
    [chatId]
  );

  const runStream = useCallback(
    async (targetChatId: string | null, content: string, regenerate: boolean, fileId?: string | null) => {
      setIsStreaming(true);
      setStreamingContent("");
      const controller = new AbortController();
      abortControllerRef.current = controller;

      let accumulated = "";
      let resolvedChatId = targetChatId;

      try {
        await chatService.streamMessage(
          { chat_id: targetChatId, content, regenerate, file_id: fileId || null },
          (event: ChatStreamEvent) => {
            switch (event.type) {
              case "chat_created":
                resolvedChatId = event.chat_id;
                // Move from /dashboard/chat to /dashboard/chat/<id> without a reload.
                router.replace(`/dashboard/chat/${event.chat_id}`);
                break;
              case "delta":
                accumulated += event.content;
                setStreamingContent(accumulated);
                break;
              case "title":
                // Sidebar re-fetches history separately; nothing to do here.
                break;
              case "error":
                toast.error(event.message);
                break;
              case "done":
                setMessages((prev) => [
                  ...prev,
                  {
                    id: event.message_id,
                    chat_id: resolvedChatId || "unknown",
                    role: "assistant",
                    content: accumulated,
                    token_count: 0,
                    created_at: new Date().toISOString(),
                  },
                ]);
                break;
            }
          },
          controller.signal
        );
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          // chatService.streamMessage throws a plain Error with a clean,
          // user-facing message for both network failures and errors
          // raised before streaming starts (e.g. 429 rate limiting) — show
          // it directly instead of a generic fallback, same as the "error"
          // SSE event case above.
          const message = (err as Error).message || "Failed to get a response. Please try again.";
          toast.error(message);
        }
      } finally {
        setIsStreaming(false);
        setStreamingContent("");
        abortControllerRef.current = null;
      }
    },
    [router]
  );

  const sendMessage = useCallback(
    async (content: string, fileId?: string | null) => {
      const trimmed = content.trim();
      if (!trimmed || isStreaming) return;

      setMessages((prev) => [...prev, makeTempMessage("user", trimmed)]);
      await runStream(chatId, trimmed, false, fileId);
    },
    [chatId, isStreaming, runStream, makeTempMessage]
  );

  const regenerate = useCallback(async () => {
    if (!chatId || isStreaming || messages.length === 0) return;
    const reversed = [...messages].reverse();
    const lastAssistantIndex = reversed.findIndex((m) => m.role === "assistant");
    if (lastAssistantIndex === -1) return;
    const lastUserMessage = reversed.find((m) => m.role === "user");
    if (!lastUserMessage) return;
    // Optimistically drop the last assistant message from view; the backend
    // drops the corresponding row and regenerates a fresh one.
    setMessages((prev) => prev.slice(0, prev.length - 1));
    await runStream(chatId, lastUserMessage.content, true);
  }, [chatId, isStreaming, messages, runStream]);

  const stopGeneration = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  return {
    messages,
    isLoadingChat,
    isStreaming,
    streamingContent,
    sendMessage,
    regenerate,
    stopGeneration,
  };
}
