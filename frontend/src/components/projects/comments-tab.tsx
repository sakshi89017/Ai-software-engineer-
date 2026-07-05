"use client";

import * as React from "react";
import { useState, useEffect, useCallback } from "react";
import {
  MessageSquare,
  Send,
  Loader2,
  User,
  Clock,
  AtSign
} from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";

interface ProjectComment {
  id: string;
  project_id: string;
  file_path?: string;
  user_id: string;
  user_email: string;
  content: string;
  created_at: string;
}

interface CommentsTabProps {
  projectId: string;
}

export function CommentsTab({ projectId }: CommentsTabProps) {
  const [comments, setComments] = useState<ProjectComment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newComment, setNewComment] = useState("");

  const loadComments = useCallback(async () => {
    try {
      const { data } = await apiClient.get<ProjectComment[]>(`/api/projects/${projectId}/comments`);
      setComments(data);
    } catch {
      toast.error("Could not fetch project comments feed.");
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadComments();
  }, [loadComments]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newComment.trim();
    if (!trimmed) return;

    setIsSubmitting(true);
    try {
      const { data } = await apiClient.post<ProjectComment>(`/api/projects/${projectId}/comments`, {
        content: trimmed
      });
      setComments((prev) => [...prev, data]);
      setNewComment("");
      toast.success("Comment added!");
    } catch {
      toast.error("Failed to post comment. Verify team permissions.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Helper to render content with highlighted @mentions
  const renderContentWithMentions = (content: string) => {
    const parts = content.split(/(@[\w\.-]+@[\w\.-]+|@[\w\.-]+)/g);
    return parts.map((part, idx) => {
      if (part.startsWith("@")) {
        return (
          <span key={idx} className="bg-primary/10 text-primary px-1.5 py-0.5 rounded font-semibold text-[11px] inline-flex items-center gap-0.5 select-all">
            <AtSign className="h-3 w-3" />
            {part.substring(1)}
          </span>
        );
      }
      return part;
    });
  };

  return (
    <div className="flex flex-col h-[60vh] border border-border rounded-xl bg-card overflow-hidden">
      
      {/* Header */}
      <div className="px-6 py-4 border-b border-border bg-muted/10 shrink-0 select-none">
        <h4 className="font-semibold text-sm flex items-center gap-2">
          <MessageSquare className="h-4.5 w-4.5 text-primary" />
          Project Discussions
        </h4>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          Ask questions, leave notes, and mention team members using @email format.
        </p>
      </div>

      {/* Timeline comments feed */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4 min-h-0 bg-muted/5 select-text">
        {isLoading ? (
          <div className="flex justify-center items-center h-full">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : comments.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-8 select-none">
            <MessageSquare className="h-8 w-8 text-muted-foreground/35 mb-2.5 stroke-[1.2]" />
            <p className="text-xs text-muted-foreground/80">No comments posted on this project yet.</p>
            <p className="text-[10px] text-muted-foreground/50 mt-0.5">Start the conversation by posting below!</p>
          </div>
        ) : (
          comments.map((comment) => (
            <div key={comment.id} className="flex items-start gap-3 p-3.5 bg-card border border-border rounded-lg shadow-sm">
              <div className="bg-primary/5 p-2 rounded-full text-primary shrink-0 select-none">
                <User className="h-4.5 w-4.5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1 select-none">
                  <span className="font-semibold text-foreground/80">{comment.user_email}</span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {new Date(comment.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-foreground/90 whitespace-pre-wrap">
                  {renderContentWithMentions(comment.content)}
                </p>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Input box */}
      <form onSubmit={handleSubmit} className="p-4 border-t border-border bg-card shrink-0 select-none">
        <div className="flex items-end gap-2.5">
          <textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Type comment (mention with @email)..."
            className="flex-1 rounded-lg border border-input bg-muted/10 px-3.5 py-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring min-h-11 max-h-24 resize-none leading-relaxed select-text"
          />
          <Button type="submit" size="sm" className="h-9 w-9 px-0 shrink-0" disabled={isSubmitting || !newComment.trim()}>
            {isSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </form>

    </div>
  );
}
