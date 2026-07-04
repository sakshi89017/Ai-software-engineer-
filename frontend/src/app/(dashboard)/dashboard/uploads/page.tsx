"use client";

import * as React from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { FileDropzone } from "@/components/uploads/file-dropzone";
import { FileListItem } from "@/components/uploads/file-list-item";
import { useFiles } from "@/hooks/use-files";
import { fileService } from "@/services/file-service";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/utils";
import type { UploadedFile } from "@/types/file";

export default function UploadsPage() {
  const router = useRouter();
  const { files, isLoading, isUploading, uploadFile, deleteFile, SUPPORTED_EXTENSIONS } = useFiles();

  const [previewFile, setPreviewFile] = useState<UploadedFile | null>(null);
  const [previewContent, setPreviewContent] = useState<string>("");
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

  const handleFilesSelected = (selected: File[]) => {
    // Upload sequentially so upload errors (bad type/size) are reported
    // per-file via individual toasts rather than one ambiguous batch error.
    selected.reduce(
      (promise, file) => promise.then(() => uploadFile(file)),
      Promise.resolve()
    );
  };

  const handlePreview = async (file: UploadedFile) => {
    setPreviewFile(file);
    setIsPreviewLoading(true);
    setPreviewContent("");
    try {
      const data = await fileService.getWithContent(file.id);
      setPreviewContent(data.content);
    } catch {
      toast.error("Failed to load file content.");
      setPreviewFile(null);
    } finally {
      setIsPreviewLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Uploads</h1>
        <p className="text-muted-foreground">
          Upload source files, then ask the AI Software Engineer to explain, debug, or improve them.
        </p>
      </div>

      <FileDropzone
        onFilesSelected={handleFilesSelected}
        isUploading={isUploading}
        acceptedExtensions={SUPPORTED_EXTENSIONS}
      />

      <div>
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Your files (Click to preview)</h2>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : files.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
            No files uploaded yet.
          </p>
        ) : (
          <div className="space-y-2">
            {files.map((file) => (
              <FileListItem 
                key={file.id} 
                file={file} 
                onDelete={deleteFile} 
                onPreview={handlePreview}
              />
            ))}
          </div>
        )}
      </div>

      {/* Code Preview Modal */}
      {previewFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="flex max-h-[85vh] w-full max-w-4xl flex-col rounded-xl border border-border bg-card shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <div>
                <h3 className="text-lg font-semibold">{previewFile.filename}</h3>
                <p className="text-xs text-muted-foreground">
                  {previewFile.file_type.toUpperCase()} File · {formatBytes(previewFile.size_bytes)}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => setPreviewFile(null)}
              >
                ✕
              </Button>
            </div>
            {/* Modal Body */}
            <div className="flex-1 overflow-auto p-6">
              {isPreviewLoading ? (
                <div className="flex h-64 items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : (
                <pre className="max-h-[50vh] rounded-lg bg-secondary/30 p-4 font-mono text-sm leading-relaxed overflow-auto text-foreground border border-border">
                  <code>{previewContent || "// Empty file"}</code>
                </pre>
              )}
            </div>
            {/* Modal Footer */}
            <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(previewContent);
                  toast.success("Code copied to clipboard!");
                }}
                disabled={isPreviewLoading || !previewContent}
              >
                Copy Content
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() => {
                  const currentFile = previewFile;
                  setPreviewFile(null);
                  router.push(`/dashboard/chat?fileId=${currentFile.id}&fileName=${encodeURIComponent(currentFile.filename)}`);
                }}
                disabled={isPreviewLoading}
              >
                Ask AI
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
