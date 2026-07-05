import { apiClient, API_URL } from "@/lib/api-client";
import { tokenStorage } from "@/lib/token-storage";
import type { UploadedFile, UploadedFileWithContent } from "@/types/file";

export const fileService = {
  async upload(file: File, onProgress?: (percent: number) => void): Promise<UploadedFile> {
    const formData = new FormData();
    formData.append("upload", file);
    const { data } = await apiClient.post<UploadedFile>("/api/uploads", formData, {
      headers: { "Content-Type": undefined },
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(percent);
        }
      },
    });
    return data;
  },

  async list(): Promise<UploadedFile[]> {
    const { data } = await apiClient.get<UploadedFile[]>("/api/uploads");
    return data;
  },

  async getWithContent(fileId: string): Promise<UploadedFileWithContent> {
    const { data } = await apiClient.get<UploadedFileWithContent>(`/api/uploads/${fileId}`);
    return data;
  },

  async remove(fileId: string): Promise<void> {
    await apiClient.delete(`/api/uploads/${fileId}`);
  },

  /**
   * Streams the AI analysis output using Server-Sent Events (SSE).
   */
  async analyzeFile(
    fileId: string,
    action: string,
    onChunk: (chunk: string) => void
  ): Promise<void> {
    const token = tokenStorage.getAccessToken();

    const response = await fetch(`${API_URL}/api/uploads/${fileId}/analyze`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ action }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(text || `Analysis request failed with status ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) return;

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
          const event = JSON.parse(jsonStr);
          if (event.type === "delta" && typeof event.content === "string") {
            onChunk(event.content);
          } else if (event.type === "error") {
            throw new Error(event.message || "An error occurred during analysis.");
          }
        } catch {
          // Ignore malformed chunks
        }
      }
    }
  },
};
