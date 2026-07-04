"use client";

import * as React from "react";
import { useState } from "react";
import Link from "next/link";
import { History, Loader2, MessageSquare, MoreHorizontal, Pencil, Search, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useChatHistory } from "@/hooks/use-chat-history";
import { groupChatsByDate } from "@/lib/date-groups";
import type { ChatListItem } from "@/types/chat";

/** Short, human-friendly time label (e.g. "2:45 PM", "Jun 3"). */
function formatTimestamp(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  return sameDay
    ? date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function HistoryPage() {
  const { chats, isLoading, searchQuery, setSearchQuery, renameChat, deleteChat } = useChatHistory();
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const startRename = (chat: ChatListItem) => {
    setRenamingId(chat.id);
    setRenameValue(chat.title);
  };

  const commitRename = async (chatId: string) => {
    const trimmed = renameValue.trim();
    setRenamingId(null);
    if (trimmed) await renameChat(chatId, trimmed);
  };

  const handleDelete = async (chatId: string) => {
    const confirmed = window.confirm("Delete this chat? This cannot be undone.");
    if (!confirmed) return;
    await deleteChat(chatId);
  };

  const groups = groupChatsByDate(chats);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Conversation History</h1>
        <p className="text-muted-foreground">Browse, search, rename, or delete your past chats.</p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search chats..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading && (
        <div className="flex justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && chats.length === 0 && (
        <div className="flex h-[50vh] flex-col items-center justify-center rounded-xl border border-dashed border-border text-center">
          <History className="mb-3 h-8 w-8 text-muted-foreground" />
          <h2 className="text-lg font-semibold">
            {searchQuery ? "No chats match your search" : "No conversations yet"}
          </h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            {searchQuery
              ? "Try a different search term."
              : "Start a new chat and it will show up here."}
          </p>
        </div>
      )}

      {!isLoading &&
        groups.map((group) => (
          <div key={group.label} className="space-y-2">
            <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {group.label}
            </h2>
            <div className="space-y-1.5">
              {group.chats.map((chat) => (
                <div
                  key={chat.id}
                  className="group flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 transition-colors hover:bg-accent/50"
                >
                  <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />

                  {renamingId === chat.id ? (
                    <div className="flex flex-1 items-center gap-1.5">
                      <Input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitRename(chat.id);
                          if (e.key === "Escape") setRenamingId(null);
                        }}
                        className="h-8 text-sm"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={() => setRenamingId(null)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <Link href={`/dashboard/chat/${chat.id}`} className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{chat.title}</p>
                        {chat.last_message_preview && (
                          <p className="truncate text-xs text-muted-foreground">
                            {chat.last_message_preview}
                          </p>
                        )}
                      </Link>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatTimestamp(chat.updated_at)}
                      </span>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0 opacity-0 group-hover:opacity-100"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => startRename(chat)}>
                            <Pencil /> Rename
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleDelete(chat.id)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
    </div>
  );
}
