export interface ChatMessage {
  id: string;
  chat_id: string;
  role: "user" | "assistant";
  content: string;
  token_count: number;
  created_at: string;
}

export interface Chat {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface ChatWithMessages extends Chat {
  messages: ChatMessage[];
}

export interface ChatListItem {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  last_message_preview: string | null;
}

export interface SendMessagePayload {
  chat_id?: string | null;
  content: string;
  regenerate?: boolean;
  file_id?: string | null;
}

// Discriminated union matching the backend's SSE event payloads exactly.
export type ChatStreamEvent =
  | { type: "chat_created"; chat_id: string }
  | { type: "delta"; content: string }
  | { type: "title"; title: string }
  | { type: "done"; message_id: string }
  | { type: "error"; message: string };
