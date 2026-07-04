"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { chatService } from "@/services/chat-service";
import type { ChatListItem } from "@/types/chat";

export function useChatHistory() {
  const [chats, setChats] = useState<ChatListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const refresh = useCallback(async (search?: string) => {
    setIsLoading(true);
    try {
      const data = await chatService.getHistory(search || undefined);
      setChats(data);
    } catch {
      toast.error("Could not load chat history.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Debounce search input so we don't hit the API on every keystroke.
  useEffect(() => {
    const timeout = setTimeout(() => {
      refresh(searchQuery);
    }, 300);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  const renameChat = useCallback(async (chatId: string, title: string) => {
    try {
      await chatService.renameChat(chatId, title);
      setChats((prev) => prev.map((c) => (c.id === chatId ? { ...c, title } : c)));
      toast.success("Chat renamed");
    } catch {
      toast.error("Could not rename chat.");
    }
  }, []);

  const deleteChat = useCallback(async (chatId: string) => {
    try {
      await chatService.deleteChat(chatId);
      setChats((prev) => prev.filter((c) => c.id !== chatId));
      toast.success("Chat deleted");
    } catch {
      toast.error("Could not delete chat.");
    }
  }, []);

  return {
    chats,
    isLoading,
    searchQuery,
    setSearchQuery,
    refresh,
    renameChat,
    deleteChat,
  };
}
