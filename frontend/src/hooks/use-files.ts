"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { fileService } from "@/services/file-service";
import { extractApiErrorMessage } from "@/lib/api-client";
import type { UploadedFile } from "@/types/file";

const SUPPORTED_EXTENSIONS = [
  ".py",
  ".js",
  ".ts",
  ".tsx",
  ".jsx",
  ".java",
  ".c",
  ".cpp",
  ".cc",
  ".h",
  ".hpp",
  ".go",
  ".rs",
  ".html",
  ".css",
  ".sql",
  ".json",
  ".yaml",
  ".yml",
  ".md",
  ".txt",
];

export function useFiles() {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await fileService.list();
      setFiles(data);
    } catch {
      toast.error("Could not load your files.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const uploadFile = useCallback(async (file: File) => {
    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.includes(ext)) {
      toast.error(`Unsupported file type "${ext}". Allowed: ${SUPPORTED_EXTENSIONS.join(", ")}`);
      return;
    }

    setIsUploading(true);
    try {
      const uploaded = await fileService.upload(file);
      setFiles((prev) => [uploaded, ...prev]);
      toast.success(`${uploaded.filename} uploaded`);
    } catch (error) {
      toast.error(extractApiErrorMessage(error));
    } finally {
      setIsUploading(false);
    }
  }, []);

  const deleteFile = useCallback(async (fileId: string) => {
    try {
      await fileService.remove(fileId);
      setFiles((prev) => prev.filter((f) => f.id !== fileId));
      toast.success("File deleted");
    } catch {
      toast.error("Could not delete file.");
    }
  }, []);

  return { files, isLoading, isUploading, uploadFile, deleteFile, refresh, SUPPORTED_EXTENSIONS };
}
