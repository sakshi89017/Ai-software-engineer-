"use client";

import * as React from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Terminal,
  Upload,
  ArrowRight,
  Sparkles
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const DEBUG_TYPES = [
  { id: "Stack Trace", label: "Stack Trace", placeholder: "Paste stack trace (e.g. traceback, call stack log)..." },
  { id: "Console Log", label: "Console Log", placeholder: "Paste console logs / terminal standard output logs..." },
  { id: "Error Message", label: "Error Message", placeholder: "Paste simple runtime error message or compile failure output..." }
];

export default function DebugAssistantPage() {
  const router = useRouter();
  const [debugType, setDebugType] = useState<string>("Stack Trace");
  const [logContent, setLogContent] = useState<string>("");
  const [dragActive, setDragActive] = useState<boolean>(false);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setLogContent(e.target.value);
  };

  const processFileContent = (file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result;
      if (typeof text === "string") {
        setLogContent(text);
        toast.success(`Successfully loaded ${file.name} logs`);
      }
    };
    reader.readAsText(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFileContent(file);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFileContent(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = logContent.trim();
    if (!trimmed) {
      toast.error("Please enter or upload error log content first.");
      return;
    }

    // Build the instruction prompt
    const prompt = `I need help debugging a runtime issue. Please analyze the following ${debugType}.\n\n` +
      `### ERROR CONTENT / LOGS:\n` +
      `\`\`\`\n` +
      `${trimmed}\n` +
      `\`\`\`\n\n` +
      `Provide a comprehensive explanation covering:\n` +
      `1. **Cause**: What is the root cause of this error?\n` +
      `2. **Fix**: Step-by-step guidance on how to fix this issue.\n` +
      `3. **Code Example**: Show a corrected code snippet comparison.\n` +
      `4. **Best Practices**: What precautions or best practices can prevent this error from recurring?`;

    // Direct the user to the chat interface with the payload
    router.push(`/dashboard/chat?debugPrompt=${encodeURIComponent(prompt)}`);
  };

  const activePlaceholder = DEBUG_TYPES.find((t) => t.id === debugType)?.placeholder;

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 bg-background select-none">
      <div className="w-full max-w-2xl bg-card border border-border rounded-xl shadow-2xl overflow-hidden p-6 md:p-8 space-y-6">
        
        {/* Title and Explanation */}
        <div className="space-y-2 text-center">
          <div className="inline-flex items-center justify-center bg-primary/10 p-3 rounded-full text-primary mb-2">
            <Terminal className="h-6 w-6 stroke-[1.5]" />
          </div>
          <h2 className="text-xl font-bold tracking-tight">AI Debug Assistant</h2>
          <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
            Upload stack traces, console logs, or error logs. Gemini AI will analyze the root cause and compile a recommended fix.
          </p>
        </div>

        {/* Input Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Debug Type Select Tabs */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Log Category</label>
            <div className="grid grid-cols-3 gap-2">
              {DEBUG_TYPES.map((type) => (
                <button
                  type="button"
                  key={type.id}
                  onClick={() => setDebugType(type.id)}
                  className={cn(
                    "p-2 text-xs border rounded-lg transition-all font-medium text-center",
                    debugType === type.id
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border text-muted-foreground hover:bg-muted/10 hover:text-foreground"
                  )}
                >
                  {type.label}
                </button>
              ))}
            </div>
          </div>

          {/* Paste log text area */}
          <div className="space-y-1.5 select-text">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Log Content</label>
              {logContent && (
                <button
                  type="button"
                  onClick={() => setLogContent("")}
                  className="text-[10px] text-destructive hover:underline font-semibold select-none"
                >
                  Clear Content
                </button>
              )}
            </div>
            <textarea
              value={logContent}
              onChange={handleTextChange}
              placeholder={activePlaceholder}
              className="w-full h-44 rounded-lg border border-input bg-muted/5 px-3 py-2 text-xs font-mono shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring leading-relaxed"
            />
          </div>

          {/* File upload zone */}
          <div
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            className={cn(
              "border border-dashed rounded-lg p-5 flex flex-col items-center justify-center gap-1.5 transition-all",
              dragActive ? "border-primary bg-primary/5" : "border-border bg-muted/5",
              "hover:border-primary/50 cursor-pointer"
            )}
          >
            <Upload className="h-5 w-5 text-muted-foreground" />
            <div className="text-[10px] font-medium text-foreground/80">
              Drag & Drop file or <label className="text-primary underline cursor-pointer hover:text-primary/95 select-none">
                Browse
                <input
                  type="file"
                  accept=".txt,.log,.trace,.json,.xml"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
            </div>
            <p className="text-[9px] text-muted-foreground/60">Supports text log extensions (.log, .txt, .json, .trace)</p>
          </div>

          {/* Submit Button */}
          <Button
            type="submit"
            variant="default"
            className="w-full h-10 text-xs font-semibold gap-1.5 hover:shadow-lg hover:shadow-primary/10 transition-all select-none"
          >
            <Sparkles className="h-4 w-4" />
            Analyze & Debug with Gemini AI
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </form>

      </div>
    </div>
  );
}
