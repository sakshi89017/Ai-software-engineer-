import { apiClient } from "@/lib/api-client";
import type { UploadedFile, UploadedFileWithContent } from "@/types/file";

export const fileService = {
  async upload(file: File): Promise<UploadedFile> {
    const formData = new FormData();
    formData.append("upload", file);
    // Don't set Content-Type manually — the browser needs to add the
    // multipart boundary itself. Axios's default JSON header would break
    // the upload if left in place, so it's explicitly cleared here.
    const { data } = await apiClient.post<UploadedFile>("/api/files/upload", formData, {
      headers: { "Content-Type": undefined },
    });
    return data;
  },

  async list(): Promise<UploadedFile[]> {
    const { data } = await apiClient.get<UploadedFile[]>("/api/files");
    return data;
  },

  async getWithContent(fileId: string): Promise<UploadedFileWithContent> {
    const { data } = await apiClient.get<UploadedFileWithContent>(`/api/files/${fileId}`);
    return data;
  },

  async remove(fileId: string): Promise<void> {
    await apiClient.delete(`/api/files/${fileId}`);
  },
};
