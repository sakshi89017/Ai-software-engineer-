"use client";

import * as React from "react";
import { useState, useEffect } from "react";
import { Loader2, X } from "lucide-react";
import { MessageList } from "@/components/chat/message-list";
import { ChatInput } from "@/components/chat/chat-input";
import { useChat } from "@/hooks/use-chat";
import { projectService } from "@/services/project-service";
import type { Project } from "@/types/project";

const GithubIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
  </svg>
);

interface ChatViewProps {
  chatId: string | null;
  initialAttachedFile?: { id: string; name: string } | null;
  initialAttachedProject?: { id: string; name: string } | null;
  initialDebugPrompt?: string | null;
}

export function ChatView({
  chatId,
  initialAttachedFile = null,
  initialAttachedProject = null,
  initialDebugPrompt = null,
}: ChatViewProps) {
  const { messages, isLoadingChat, isStreaming, streamingContent, sendMessage, regenerate, stopGeneration } =
    useChat({ chatId });

  const [attachedFile, setAttachedFile] = useState(initialAttachedFile);
  const [attachedProject, setAttachedProject] = useState(initialAttachedProject);
  const [isVoiceResponseEnabled, setIsVoiceResponseEnabled] = useState(false);

  // Voice feedback speech reader
  React.useEffect(() => {
    if (isVoiceResponseEnabled && !isStreaming && messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.role === "assistant" && lastMsg.content) {
        if (typeof window !== "undefined" && window.speechSynthesis) {
          window.speechSynthesis.cancel();
          const cleanText = lastMsg.content
            .replace(/```[\s\S]*?```/g, "[code generated]")
            .replace(/[*#`_\-]/g, "")
            .trim();
          const utterance = new SpeechSynthesisUtterance(cleanText);
          utterance.lang = "en-US";
          window.speechSynthesis.speak(utterance);
        }
      }
    }
  }, [messages, isStreaming, isVoiceResponseEnabled]);

  // Trigger debugging prompt automatic send if landing from Debug Assistant
  React.useEffect(() => {
    if (initialDebugPrompt && !chatId && messages.length === 0 && !isStreaming) {
      sendMessage(initialDebugPrompt);
    }
  }, [initialDebugPrompt, chatId, messages.length, isStreaming, sendMessage]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isProjectsLoading, setIsProjectsLoading] = useState(false);

  // Fetch projects list to populate repository context selector
  useEffect(() => {
    setIsProjectsLoading(true);
    projectService
      .list()
      .then((list) => {
        setProjects(list.filter((p) => p.status === "completed"));
        
        // If we are loading an existing chat session, let's extract the project_id from the last messages
        if (chatId && messages.length > 0) {
          const lastMsgWithProject = [...messages].reverse().find((m) => m.project_id);
          if (lastMsgWithProject && lastMsgWithProject.project_id) {
            const matchedProj = list.find((p) => p.id === lastMsgWithProject.project_id);
            if (matchedProj) {
              setAttachedProject({
                id: matchedProj.id,
                name: `${matchedProj.repo_owner}/${matchedProj.repo_name}`,
              });
            }
          }
        }
      })
      .catch(() => {})
      .finally(() => setIsProjectsLoading(false));
  }, [chatId, messages]);

  const handleSend = (content: string) => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    sendMessage(content, attachedFile?.id, attachedProject?.id);
    // Standard file attachments clear on first send, whereas project context
    // persists throughout the conversation session for ongoing repository Q&A.
    setAttachedFile(null);
  };

  if (isLoadingChat) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Context Selection Header */}
      <div className="px-6 py-2 border-b border-border bg-muted/10 flex items-center justify-between gap-4 select-none shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Repository Context:</span>
          {attachedProject ? (
            <div className="flex items-center gap-1.5 bg-primary/10 border border-primary/20 text-primary rounded px-2.5 py-0.5 text-xs font-semibold">
              <GithubIcon className="h-3 w-3" />
              <span>{attachedProject.name}</span>
              <button
                onClick={() => setAttachedProject(null)}
                className="hover:text-destructive transition-colors ml-1"
                title="Clear Context"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : isProjectsLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          ) : projects.length === 0 ? (
            <span className="text-xs text-muted-foreground italic">No imported repositories found.</span>
          ) : (
            <select
              onChange={(e) => {
                const p = projects.find((proj) => proj.id === e.target.value);
                if (p) {
                  setAttachedProject({
                    id: p.id,
                    name: `${p.repo_owner}/${p.repo_name}`,
                  });
                }
              }}
              value=""
              className="h-7 rounded border border-input bg-background px-2 py-0.5 text-[11px] text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="" disabled>Select project repository...</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.repo_owner}/{p.repo_name}
                </option>
              ))}
            </select>
          )}
        </div>

        {attachedFile && (
          <div className="flex items-center gap-1.5 bg-secondary text-secondary-foreground rounded px-2 py-0.5 text-[11px] font-mono">
            <span>📄 {attachedFile.name}</span>
            <button onClick={() => setAttachedFile(null)} className="hover:text-destructive">
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        <MessageList
          messages={messages}
          isStreaming={isStreaming}
          streamingContent={streamingContent}
          onRegenerate={regenerate}
          onSelectPrompt={(prompt) => sendMessage(prompt, null, attachedProject?.id)}
        />
      </div>

      <ChatInput
        onSend={handleSend}
        onStop={() => {
          if (typeof window !== "undefined" && window.speechSynthesis) {
            window.speechSynthesis.cancel();
          }
          stopGeneration();
        }}
        isStreaming={isStreaming}
        attachedFile={attachedFile}
        onRemoveAttachment={() => setAttachedFile(null)}
        isVoiceResponseEnabled={isVoiceResponseEnabled}
        onToggleVoiceResponse={() => {
          if (isVoiceResponseEnabled && typeof window !== "undefined" && window.speechSynthesis) {
            window.speechSynthesis.cancel();
          }
          setIsVoiceResponseEnabled(!isVoiceResponseEnabled);
        }}
      />
    </div>
  );
}
