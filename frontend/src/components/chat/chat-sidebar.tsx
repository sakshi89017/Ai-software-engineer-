"use client";

import * as React from "react";
import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { MessageSquarePlus, MoreHorizontal, Pencil, Search, Trash2, X, Pin, ArrowUpDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useChatHistory } from "@/hooks/use-chat-history";
import { cn } from "@/lib/utils";

export function ChatSidebar() {
  const router = useRouter();
  const params = useParams<{ id?: string }>();
  const activeChatId = params?.id;

  const { chats, isLoading, searchQuery, setSearchQuery, sortBy, setSortBy, renameChat, deleteChat, togglePinChat } = useChatHistory();
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const startRename = (chatId: string, currentTitle: string) => {
    setRenamingId(chatId);
    setRenameValue(currentTitle);
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
    if (activeChatId === chatId) {
      router.push("/dashboard/chat");
    }
  };

  return (
    <aside className="flex w-72 shrink-0 flex-col border-r border-border bg-card/50">
      <div className="space-y-2 border-b border-border p-3">
        <Button className="w-full justify-start gap-2" onClick={() => router.push("/dashboard/chat")}>
          <MessageSquarePlus className="h-4 w-4" />
          New Chat
        </Button>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search chats..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 pl-8 text-sm w-full"
            />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 border border-border shrink-0" aria-label="Sort chats">
                <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setSortBy("newest")} className={cn(sortBy === "newest" && "font-bold text-primary")}>
                Newest
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortBy("oldest")} className={cn(sortBy === "oldest" && "font-bold text-primary")}>
                Oldest
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortBy("pinned")} className={cn(sortBy === "pinned" && "font-bold text-primary")}>
                Pinned
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {isLoading && <p className="px-2 py-3 text-xs text-muted-foreground">Loading chats...</p>}

        {!isLoading && chats.length === 0 && (
          <p className="px-2 py-3 text-xs text-muted-foreground">
            {searchQuery ? "No chats match your search." : "No conversations yet."}
          </p>
        )}

        <div className="space-y-0.5">
          {chats.map((chat) => {
            const isActive = chat.id === activeChatId;
            return (
              <div
                key={chat.id}
                className={cn(
                  "group flex items-center gap-1 rounded-md px-2 py-1.5 text-sm",
                  isActive ? "bg-accent" : "hover:bg-accent/60"
                )}
              >
                {renamingId === chat.id ? (
                  <div className="flex flex-1 items-center gap-1">
                    <Input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename(chat.id);
                        if (e.key === "Escape") setRenamingId(null);
                      }}
                      className="h-7 text-sm"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      onClick={() => setRenamingId(null)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <Link href={`/dashboard/chat/${chat.id}`} className="min-w-0 flex-1 truncate flex items-center gap-1.5">
                      {chat.is_pinned && <Pin className="h-3 w-3 shrink-0 text-primary rotate-45" />}
                      <span className="truncate">{chat.title}</span>
                    </Link>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100"
                        >
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => togglePinChat(chat.id, chat.is_pinned)}>
                          <Pin className="h-3.5 w-3.5 mr-2 rotate-45" /> {chat.is_pinned ? "Unpin" : "Pin"}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => startRename(chat.id, chat.title)}>
                          <Pencil className="h-3.5 w-3.5 mr-2" /> Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleDelete(chat.id)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
