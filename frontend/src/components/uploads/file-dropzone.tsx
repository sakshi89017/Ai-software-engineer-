"use client";

import * as React from "react";
import { useCallback, useRef, useState } from "react";
import { Loader2, UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";

interface FileDropzoneProps {
  onFilesSelected: (files: File[]) => void;
  isUploading: boolean;
  acceptedExtensions: string[];
}

export function FileDropzone({ onFilesSelected, isUploading, acceptedExtensions }: FileDropzoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragOver(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length) onFilesSelected(files);
    },
    [onFilesSelected]
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length) onFilesSelected(files);
    e.target.value = "";
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-10 text-center transition-colors",
        isDragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
      )}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={acceptedExtensions.join(",")}
        onChange={handleInputChange}
        className="hidden"
      />
      {isUploading ? (
        <Loader2 className="mb-3 h-8 w-8 animate-spin text-primary" />
      ) : (
        <UploadCloud className="mb-3 h-8 w-8 text-muted-foreground" />
      )}
      <p className="text-sm font-medium">
        {isUploading ? "Uploading..." : "Drag and drop files here, or click to browse"}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Supports {acceptedExtensions.join(", ")} — up to 2MB per file
      </p>
    </div>
  );
}
