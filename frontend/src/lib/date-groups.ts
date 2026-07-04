import type { ChatListItem } from "@/types/chat";

export type DateGroupLabel = "Today" | "Yesterday" | "Previous 7 Days" | "Older";

const GROUP_ORDER: DateGroupLabel[] = ["Today", "Yesterday", "Previous 7 Days", "Older"];

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function groupLabelFor(dateStr: string, now: Date): DateGroupLabel {
  const date = new Date(dateStr);
  const dayDiff = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);

  if (dayDiff <= 0) return "Today";
  if (dayDiff === 1) return "Yesterday";
  if (dayDiff <= 7) return "Previous 7 Days";
  return "Older";
}

/**
 * Groups chats by `updated_at` into standard ChatGPT-style buckets, preserving
 * each chat's original (already most-recent-first) ordering within its bucket.
 * Empty buckets are omitted entirely.
 */
export function groupChatsByDate(
  chats: ChatListItem[],
  now: Date = new Date()
): { label: DateGroupLabel; chats: ChatListItem[] }[] {
  const buckets = new Map<DateGroupLabel, ChatListItem[]>();

  for (const chat of chats) {
    const label = groupLabelFor(chat.updated_at, now);
    const existing = buckets.get(label);
    if (existing) {
      existing.push(chat);
    } else {
      buckets.set(label, [chat]);
    }
  }

  return GROUP_ORDER.filter((label) => buckets.has(label)).map((label) => ({
    label,
    chats: buckets.get(label)!,
  }));
}
