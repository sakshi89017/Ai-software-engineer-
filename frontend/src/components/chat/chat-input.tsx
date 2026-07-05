"use client";

import * as React from "react";
import { useRef, useState } from "react";
import { FileCode2, Send, Square, X, Mic, MicOff, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AI_ACTIONS } from "@/lib/ai-actions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface AttachedFile {
  id: string;
  name: string;
}

interface ChatInputProps {
  onSend: (content: string) => void;
  onStop: () => void;
  isStreaming: boolean;
  disabled?: boolean;
  attachedFile?: AttachedFile | null;
  onRemoveAttachment?: () => void;
  isVoiceResponseEnabled: boolean;
  onToggleVoiceResponse: () => void;
}

const GENERAL_SUGGESTION_PROMPTS = [
  { label: "Explain this algorithm", text: "Explain this algorithm step-by-step, including its time and space complexity:\n\n" },
  { label: "Generate unit tests", text: "Generate comprehensive unit tests for this code, covering edge cases:\n\n" },
  { label: "Optimize code", text: "Optimize this code for better performance, memory footprint, and readability:\n\n" },
  { label: "Review my API", text: "Review this API design/endpoint, checking for security vulnerabilities and REST standards:\n\n" },
  { label: "Debug error", text: "Help me debug this error. Explain why it occurs and how to fix it:\n\n" },
  { label: "Create database schema", text: "Create a SQL database schema for an application with tables, indexes, and foreign keys for:\n\n" },
  { label: "Generate React component", text: "Generate a fully styled, accessible, responsive React TypeScript component for:\n\n" },
];

export function ChatInput({
  onSend,
  onStop,
  isStreaming,
  disabled,
  attachedFile,
  onRemoveAttachment,
  isVoiceResponseEnabled,
  onToggleVoiceResponse,
}: ChatInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<{ stop: () => void } | null>(null);

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      const win = window as unknown as {
        SpeechRecognition?: new () => {
          continuous: boolean;
          interimResults: boolean;
          lang: string;
          onresult: (e: { resultIndex: number; results: { length: number; [i: number]: { [j: number]: { transcript: string } } } }) => void;
          onerror: () => void;
          onend: () => void;
          start: () => void;
          stop: () => void;
        };
        webkitSpeechRecognition?: new () => {
          continuous: boolean;
          interimResults: boolean;
          lang: string;
          onresult: (e: { resultIndex: number; results: { length: number; [i: number]: { [j: number]: { transcript: string } } } }) => void;
          onerror: () => void;
          onend: () => void;
          start: () => void;
          stop: () => void;
        };
      };
      const SpeechRecognition = win.SpeechRecognition || win.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        toast.error("Web Speech API is not supported in this browser.");
        return;
      }
      try {
        const rec = new SpeechRecognition();
        rec.continuous = true;
        rec.interimResults = true;
        rec.lang = "en-US";
        
        rec.onresult = (event) => {
          let text = "";
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            text += event.results[i][0].transcript;
          }
          setValue((prev) => {
            const trimmed = prev.trim();
            return trimmed ? `${trimmed} ${text}` : text;
          });
        };
        
        rec.onerror = () => {
          setIsListening(false);
        };
        
        rec.onend = () => {
          setIsListening(false);
        };
        
        rec.start();
        recognitionRef.current = rec;
        setIsListening(true);
      } catch (err) {
        console.error("Speech recognition start failed", err);
        setIsListening(false);
      }
    }
  };

  const handleSend = () => {
    if (!value.trim() || isStreaming || disabled) return;
    onSend(value);
    setValue("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  };

  const handleActionClick = (buildPrompt: (fileName: string) => string) => {
    if (isStreaming || disabled || !attachedFile) return;
    onSend(buildPrompt(attachedFile.name));
    setValue("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  };

  return (
    <div className="border-t border-border bg-background p-4">
      <div className="mx-auto max-w-3xl">
        {attachedFile && (
          <div className="mb-2 flex w-fit items-center gap-2 rounded-lg border border-border bg-secondary px-3 py-1.5 text-xs">
            <FileCode2 className="h-3.5 w-3.5 text-primary" />
            <span className="font-medium">{attachedFile.name}</span>
            <button
              type="button"
              onClick={onRemoveAttachment}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Remove attachment"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        {attachedFile && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {AI_ACTIONS.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.id}
                  type="button"
                  disabled={isStreaming || disabled}
                  onClick={() => handleActionClick(action.buildPrompt)}
                  className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                >
                  <Icon className="h-3.5 w-3.5" />
                  {action.label}
                </button>
              );
            })}
          </div>
        )}
        {!attachedFile && (
          <div className="mb-2 flex flex-wrap gap-1.5 max-h-[75px] overflow-y-auto pr-1">
            {GENERAL_SUGGESTION_PROMPTS.map((prompt) => (
              <button
                key={prompt.label}
                type="button"
                disabled={isStreaming || disabled}
                onClick={() => {
                  setValue(prompt.text);
                  textareaRef.current?.focus();
                  if (textareaRef.current) {
                    setTimeout(() => {
                      textareaRef.current!.style.height = "auto";
                      textareaRef.current!.style.height = `${Math.min(textareaRef.current!.scrollHeight, 200)}px`;
                    }, 50);
                  }
                }}
                className="flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
              >
                {prompt.label}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2 rounded-2xl border border-input bg-card p-2 shadow-sm">
          {isListening && (
            <div className="flex items-center gap-1 px-3 self-center select-none border-r border-border shrink-0 pr-4 h-6">
              <span className="h-2 w-2 rounded-full bg-red-500 animate-ping shrink-0" />
              <div className="flex items-end gap-0.5 h-3">
                <div className="h-1.5 w-0.5 bg-red-500 rounded-full animate-bounce" style={{ animationDelay: "0ms", animationDuration: "0.8s" }} />
                <div className="h-3 w-0.5 bg-red-500 rounded-full animate-bounce" style={{ animationDelay: "150ms", animationDuration: "0.8s" }} />
                <div className="h-2 w-0.5 bg-red-500 rounded-full animate-bounce" style={{ animationDelay: "300ms", animationDuration: "0.8s" }} />
              </div>
            </div>
          )}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={
              isListening
                ? "Listening... speak now..."
                : attachedFile
                ? `Ask about ${attachedFile.name}, or use a quick action above...`
                : "Ask about code, debugging, architecture..."
            }
            rows={1}
            disabled={disabled}
            className="max-h-[200px] flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground disabled:opacity-50"
          />
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={toggleListening}
            className={cn(
              "h-9 w-9 rounded-xl",
              isListening ? "text-red-500 bg-red-500/10 animate-pulse hover:text-red-600" : "text-muted-foreground hover:text-foreground"
            )}
            title="Dictate with Speech-to-Text"
          >
            {isListening ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
          </Button>

          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={onToggleVoiceResponse}
            className={cn(
              "h-9 w-9 rounded-xl",
              isVoiceResponseEnabled ? "text-primary bg-primary/10 hover:text-primary/80" : "text-muted-foreground hover:text-foreground"
            )}
            title="Toggle Voice Read Aloud"
          >
            {isVoiceResponseEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </Button>

          {isStreaming ? (
            <Button size="icon" variant="destructive" onClick={onStop} aria-label="Stop generating">
              <Square className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              size="icon"
              onClick={handleSend}
              disabled={!value.trim() || disabled}
              aria-label="Send message"
            >
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>
        <p className="mt-1.5 text-center text-xs text-muted-foreground">
          Press Enter to send, Shift+Enter for a new line.
        </p>
      </div>
    </div>
  );
}

