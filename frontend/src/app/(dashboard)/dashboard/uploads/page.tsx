"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { FileDropzone } from "@/components/uploads/file-dropzone";
import { FileListItem } from "@/components/uploads/file-list-item";
import { useFiles } from "@/hooks/use-files";

export default function UploadsPage() {
  const { files, isLoading, isUploading, uploadFile, deleteFile, SUPPORTED_EXTENSIONS } = useFiles();

  const handleFilesSelected = (selected: File[]) => {
    // Upload sequentially so upload errors (bad type/size) are reported
    // per-file via individual toasts rather than one ambiguous batch error.
    selected.reduce(
      (promise, file) => promise.then(() => uploadFile(file)),
      Promise.resolve()
    );
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Uploads</h1>
        <p className="text-muted-foreground">
          Upload source files, then ask DevPilot AI to explain, debug, or improve them.
        </p>
      </div>

      <FileDropzone
        onFilesSelected={handleFilesSelected}
        isUploading={isUploading}
        acceptedExtensions={SUPPORTED_EXTENSIONS}
      />

      <div>
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Your files</h2>
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
              <FileListItem key={file.id} file={file} onDelete={deleteFile} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
