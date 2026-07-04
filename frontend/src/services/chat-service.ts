import { apiClient, API_URL } from "@/lib/api-client";
import { tokenStorage } from "@/lib/token-storage";
import type {
  Chat,
  ChatListItem,
  ChatWithMessages,
  ChatStreamEvent,
  SendMessagePayload,
} from "@/types/chat";

export const chatService = {
  async createChat(title?: string): Promise<Chat> {
    const { data } = await apiClient.post<Chat>("/api/chat/new", { title });
    return data;
  },

  async getHistory(search?: string): Promise<ChatListItem[]> {
    const { data } = await apiClient.get<ChatListItem[]>("/api/chat/history", {
      params: search ? { search } : undefined,
    });
    return data;
  },

  async getChat(chatId: string): Promise<ChatWithMessages> {
    const { data } = await apiClient.get<ChatWithMessages>(`/api/chat/${chatId}`);
    return data;
  },

  async renameChat(chatId: string, title: string): Promise<Chat> {
    const { data } = await apiClient.patch<Chat>(`/api/chat/${chatId}`, { title });
    return data;
  },

  async deleteChat(chatId: string): Promise<void> {
    await apiClient.delete(`/api/chat/${chatId}`);
  },

  /**
   * Streams a chat completion via SSE using fetch (axios can't stream the
   * response body in the browser). Calls `onEvent` for each parsed event and
   * respects the given AbortSignal so the UI's "Stop generating" button works.
   */
  async streamMessage(
    payload: SendMessagePayload,
    onEvent: (event: ChatStreamEvent) => void,
    signal: AbortSignal
  ): Promise<void> {
    const token = tokenStorage.getAccessToken();

    const response = await fetch(`${API_URL}/api/chat/message`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
      signal,
    });

    if (!response.ok || !response.body) {
      // Errors raised before streaming starts (e.g. 429 from the rate
      // limiter, or a validation error) come back as a plain JSON body
      // like {"detail": "..."} rather than an SSE stream. Parse it the
      // same way apiClient/extractApiErrorMessage would, so the toast
      // shown by use-chat.ts's catch block reads like a normal message
      // instead of raw JSON.
      const text = await response.text().catch(() => "");
      let message = text || `Request failed with status ${response.status}`;
      try {
        const parsed = JSON.parse(text);
        if (typeof parsed?.detail === "string") {
          message = parsed.detail;
        } else if (Array.isArray(parsed?.detail) && parsed.detail[0]?.msg) {
          message = parsed.detail[0].msg;
        }
      } catch {
        // Not JSON — fall back to the raw text set above.
      }
      throw new Error(message);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() || "";

      for (const part of parts) {
        const line = part.trim();
        if (!line.startsWith("data:")) continue;
        const jsonStr = line.slice(5).trim();
        if (!jsonStr) continue;
        try {
          const event = JSON.parse(jsonStr) as ChatStreamEvent;
          onEvent(event);
        } catch {
          // Ignore malformed SSE chunks rather than crashing the stream.
        }
      }
    }
  },
};
