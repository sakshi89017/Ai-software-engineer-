"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { chatService } from "@/services/chat-service";
import type { ChatListItem } from "@/types/chat";

export function useChatHistory() {
  const [chats, setChats] = useState<ChatListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<string>("newest");

  const refresh = useCallback(async (search?: string, currentSort?: string) => {
    setIsLoading(true);
    try {
      const data = await chatService.getHistory(search || undefined, currentSort || sortBy);
      setChats(data);
    } catch {
      toast.error("Could not load chat history.");
    } finally {
      setIsLoading(false);
    }
  }, [sortBy]);

  useEffect(() => {
    refresh(searchQuery, sortBy);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh, sortBy]);

  // Debounce search input so we don't hit the API on every keystroke.
  useEffect(() => {
    const timeout = setTimeout(() => {
      refresh(searchQuery, sortBy);
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchQuery, sortBy, refresh]);

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

  const togglePinChat = useCallback(async (chatId: string, currentPinStatus: boolean) => {
    try {
      await chatService.updateChat(chatId, { is_pinned: !currentPinStatus });
      setChats((prev) => prev.map((c) => (c.id === chatId ? { ...c, is_pinned: !currentPinStatus } : c)));
      toast.success(!currentPinStatus ? "Chat pinned" : "Chat unpinned");
      refresh(searchQuery, sortBy);
    } catch {
      toast.error("Could not toggle pin status.");
    }
  }, [refresh, searchQuery, sortBy]);

  return {
    chats,
    isLoading,
    searchQuery,
    setSearchQuery,
    sortBy,
    setSortBy,
    refresh,
    renameChat,
    deleteChat,
    togglePinChat,
  };
}
