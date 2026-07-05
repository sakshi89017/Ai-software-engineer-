"use client";

import * as React from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  FileCode2,
  Sparkles,
  Bug,
  Gauge,
  MessageSquareCode,
  Binary,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  BookOpenText,
  Copy,
  Check
} from "lucide-react";
import { toast } from "sonner";
import { FileDropzone } from "@/components/uploads/file-dropzone";
import { FileListItem } from "@/components/uploads/file-list-item";
import { useFiles } from "@/hooks/use-files";
import { fileService } from "@/services/file-service";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/utils";
import { MarkdownMessage } from "@/components/chat/markdown-message";
import { cn } from "@/lib/utils";
import { extractApiErrorMessage } from "@/lib/api-client";
import type { UploadedFile } from "@/types/file";

const ANALYSIS_ACTIONS = [
  { id: "explain", label: "Explain Code", icon: BookOpenText },
  { id: "bugs", label: "Find Bugs", icon: Bug },
  { id: "optimize", label: "Optimize Code", icon: Gauge },
  { id: "comments", label: "Generate Comments", icon: MessageSquareCode },
  { id: "algorithm", label: "Explain Algorithm", icon: Binary },
  { id: "improvements", label: "Suggest Improvements", icon: Sparkles },
  { id: "tests", label: "Generate Unit Tests", icon: ShieldCheck },
  { id: "summarize", label: "Summarize File", icon: FileCode2 },
];

export default function UploadsPage() {
  const router = useRouter();
  const { files, isLoading, refresh, deleteFile, SUPPORTED_EXTENSIONS } = useFiles();

  const [previewFile, setPreviewFile] = useState<UploadedFile | null>(null);
  const [previewContent, setPreviewContent] = useState<string>("");
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Upload progress tracking state
  const [uploadingFiles, setUploadingFiles] = useState<{ id: string; name: string; progress: number }[]>([]);

  // AI analysis states
  const [isAiPanelOpen, setIsAiPanelOpen] = useState(true);
  const [analysisText, setAnalysisText] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [currentAction, setCurrentAction] = useState<string | null>(null);

  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedAnalysis, setCopiedAnalysis] = useState(false);

  const handleFilesSelected = async (selected: File[]) => {
    // Validate file extensions
    const invalidFiles = selected.filter((file) => {
      const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
      return !SUPPORTED_EXTENSIONS.includes(ext);
    });

    if (invalidFiles.length > 0) {
      toast.error(`Unsupported files: ${invalidFiles.map((f) => f.name).join(", ")}`);
      return;
    }

    // Process uploads sequentially so they stream progress accurately
    for (const file of selected) {
      const uploadId = Math.random().toString(36).slice(2);
      setUploadingFiles((prev) => [...prev, { id: uploadId, name: file.name, progress: 0 }]);

      try {
        await fileService.upload(file, (percent) => {
          setUploadingFiles((prev) =>
            prev.map((item) => (item.id === uploadId ? { ...item, progress: percent } : item))
          );
        });
        toast.success(`${file.name} uploaded successfully!`);
      } catch (error) {
        toast.error(`Failed to upload ${file.name}: ${extractApiErrorMessage(error)}`);
      } finally {
        setUploadingFiles((prev) => prev.filter((item) => item.id !== uploadId));
      }
    }

    refresh();
  };

  const handlePreview = async (file: UploadedFile) => {
    setPreviewFile(file);
    setIsPreviewLoading(true);
    setPreviewContent("");
    setAnalysisText("");
    setSearchQuery("");
    setCurrentAction(null);
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

  const handleRunAnalysis = async (actionId: string) => {
    if (!previewFile || isAnalyzing) return;
    setIsAnalyzing(true);
    setCurrentAction(actionId);
    setAnalysisText("");
    try {
      await fileService.analyzeFile(previewFile.id, actionId, (chunk) => {
        setAnalysisText((prev) => prev + chunk);
      });
    } catch {
      toast.error("Analysis failed. Please check Gemini API Key settings.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleCopyCode = async () => {
    await navigator.clipboard.writeText(previewContent);
    setCopiedCode(true);
    toast.success("Code copied to clipboard!");
    setTimeout(() => setCopiedCode(false), 1500);
  };

  const handleCopyAnalysis = async () => {
    await navigator.clipboard.writeText(analysisText);
    setCopiedAnalysis(true);
    toast.success("Analysis copied to clipboard!");
    setTimeout(() => setCopiedAnalysis(false), 1500);
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  const highlightMatch = (text: string, query: string) => {
    if (!query) return text;
    const parts = text.split(new RegExp(`(${query})`, "gi"));
    return parts.map((part, idx) =>
      part.toLowerCase() === query.toLowerCase() ? (
        <mark
          key={idx}
          className="bg-yellow-500/30 text-yellow-900 dark:text-yellow-100 px-0.5 rounded border border-yellow-500/40 font-semibold"
        >
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  const codeLines = previewContent.split("\n");
  const isCurrentlyUploading = uploadingFiles.length > 0;

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
        isUploading={isCurrentlyUploading}
        acceptedExtensions={SUPPORTED_EXTENSIONS}
      />

      {/* Active Uploads Queue */}
      {isCurrentlyUploading && (
        <div className="space-y-3 rounded-lg border border-border bg-muted/10 p-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Uploading Files...
          </h3>
          <div className="space-y-2">
            {uploadingFiles.map((file) => (
              <div key={file.id} className="space-y-1">
                <div className="flex justify-between text-xs font-medium">
                  <span className="truncate max-w-[80%]">{file.name}</span>
                  <span>{file.progress}%</span>
                </div>
                <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${file.progress}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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

      {/* Code Preview & Analysis Modal */}
      {previewFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="flex h-[90vh] w-full max-w-6xl flex-col rounded-xl border border-border bg-card shadow-2xl overflow-hidden">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-border px-6 py-4 shrink-0 bg-muted/10">
              <div className="flex items-center gap-3">
                <div>
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <FileCode2 className="h-5 w-5 text-primary" />
                    {previewFile.filename}
                  </h3>
                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                    <span className="bg-primary/15 text-primary px-2 py-0.5 rounded font-bold uppercase text-[10px] tracking-wide">
                      {previewFile.language || previewFile.file_type || "TEXT"}
                    </span>
                    <span>·</span>
                    <span>{formatBytes(previewFile.size || previewFile.size_bytes)}</span>
                    <span>·</span>
                    <span>Uploaded {formatDate(previewFile.created_at)}</span>
                  </div>
                </div>
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

            {/* Modal Panels Container */}
            <div className="flex flex-1 overflow-hidden min-h-0">
              
              {/* Left Panel: Code Viewer */}
              <div className="flex flex-1 flex-col p-6 overflow-hidden min-w-0 border-r border-border">
                <div className="flex justify-between items-center mb-3 gap-4 shrink-0">
                  <h4 className="text-sm font-semibold text-muted-foreground shrink-0">Source Code</h4>
                  
                  {/* Search inside File */}
                  <div className="flex items-center gap-2 flex-1 max-w-xs">
                    <input
                      type="text"
                      placeholder="Search code..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    />
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 shrink-0"
                    onClick={handleCopyCode}
                    disabled={isPreviewLoading || !previewContent}
                  >
                    {copiedCode ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    Copy Code
                  </Button>
                </div>

                <div className="flex-1 overflow-auto rounded-lg border border-border bg-muted/15 font-mono text-sm leading-relaxed flex min-h-0">
                  {isPreviewLoading ? (
                    <div className="flex-1 flex items-center justify-center">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                  ) : (
                    <>
                      {/* Line Numbers */}
                      <div className="py-4 select-none bg-muted/40 border-r border-border text-right text-muted-foreground/60 min-w-[3.5rem] pr-3 text-xs leading-6">
                        {codeLines.map((_, i) => (
                          <div key={i}>{i + 1}</div>
                        ))}
                      </div>
                      {/* Code Content */}
                      <div className="py-4 pl-4 pr-6 select-text overflow-x-auto w-full text-foreground/90 text-xs leading-6 whitespace-pre min-w-0">
                        {codeLines.map((line, i) => (
                          <div
                            key={i}
                            className={cn(
                              searchQuery && line.toLowerCase().includes(searchQuery.toLowerCase())
                                ? "bg-yellow-500/10 -mx-4 px-4 border-l-2 border-yellow-500"
                                : ""
                            )}
                          >
                            {highlightMatch(line, searchQuery) || " "}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Toggle Button in the middle */}
              <button
                onClick={() => setIsAiPanelOpen(!isAiPanelOpen)}
                className="self-center -mx-3.5 z-10 flex h-7 w-7 items-center justify-center rounded-full border border-border bg-card shadow hover:bg-accent text-muted-foreground"
                title={isAiPanelOpen ? "Collapse AI Assistant" : "Expand AI Assistant"}
              >
                {isAiPanelOpen ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
              </button>

              {/* Right Panel: AI Analysis Drawer */}
              {isAiPanelOpen && (
                <div className="w-96 shrink-0 flex flex-col p-6 bg-muted/5 min-h-0 overflow-y-auto">
                  <div className="flex justify-between items-center mb-4 shrink-0">
                    <h4 className="text-sm font-semibold flex items-center gap-1.5 text-primary">
                      <Sparkles className="h-4 w-4" />
                      AI Code Analysis
                    </h4>
                    {analysisText && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs gap-1.5 text-muted-foreground"
                        onClick={handleCopyAnalysis}
                        disabled={isAnalyzing}
                      >
                        {copiedAnalysis ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                        Copy Analysis
                      </Button>
                    )}
                  </div>

                  {/* Actions Grid */}
                  <div className="grid grid-cols-2 gap-2 mb-4 shrink-0">
                    {ANALYSIS_ACTIONS.map((action) => {
                      const Icon = action.icon;
                      const isActive = currentAction === action.id;
                      return (
                        <Button
                          key={action.id}
                          variant={isActive ? "default" : "outline"}
                          size="sm"
                          className="h-9 justify-start text-xs gap-2 font-medium"
                          disabled={isAnalyzing || isPreviewLoading}
                          onClick={() => handleRunAnalysis(action.id)}
                        >
                          {isActive && isAnalyzing ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Icon className="h-3.5 w-3.5 shrink-0" />
                          )}
                          <span className="truncate">{action.label}</span>
                        </Button>
                      );
                    })}
                  </div>

                  {/* Analysis Content Viewer */}
                  <div className="flex-1 rounded-lg border border-border bg-card p-4 overflow-y-auto text-sm min-h-0">
                    {isAnalyzing && !analysisText ? (
                      <div className="flex flex-col items-center justify-center h-full py-8 text-muted-foreground">
                        <Loader2 className="h-6 w-6 animate-spin text-primary mb-2" />
                        <span>Analyzing with Gemini...</span>
                      </div>
                    ) : analysisText ? (
                      <div className="prose dark:prose-invert max-w-none text-xs leading-relaxed">
                        <MarkdownMessage content={analysisText} />
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full text-center py-8 text-muted-foreground/60">
                        <Sparkles className="h-8 w-8 mb-2 stroke-[1.5]" />
                        <p className="text-xs">Select an action above to analyze the source code file.</p>
                      </div>
                    )}
                  </div>

                  {/* Ask AI in Chat Helper */}
                  <div className="mt-4 pt-4 border-t border-border shrink-0">
                    <Button
                      variant="secondary"
                      className="w-full text-xs font-semibold gap-1.5"
                      onClick={() => {
                        const currentFile = previewFile;
                        setPreviewFile(null);
                        router.push(`/dashboard/chat?fileId=${currentFile.id}&fileName=${encodeURIComponent(currentFile.filename)}`);
                      }}
                      disabled={isPreviewLoading}
                    >
                      Ask AI in Chat View
                    </Button>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      )}
    </div>
  );
}
