"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FileCode2, MessageSquare, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/utils";
import type { UploadedFile } from "@/types/file";

interface FileListItemProps {
  file: UploadedFile;
  onDelete: (id: string) => void;
}

export function FileListItem({ file, onDelete }: FileListItemProps) {
  const router = useRouter();

  const handleAskAI = () => {
    router.push(`/dashboard/chat?fileId=${file.id}&fileName=${encodeURIComponent(file.filename)}`);
  };

  const handleDelete = () => {
    const confirmed = window.confirm(`Delete "${file.filename}"? This cannot be undone.`);
    if (confirmed) onDelete(file.id);
  };

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <FileCode2 className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{file.filename}</p>
          <p className="text-xs text-muted-foreground">
            {file.file_type} · {formatBytes(file.size_bytes)} · {new Date(file.created_at).toLocaleDateString()}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={handleAskAI}>
          <MessageSquare className="h-3.5 w-3.5" />
          Ask AI
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={handleDelete}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
