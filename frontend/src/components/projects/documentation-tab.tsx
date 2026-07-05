"use client";

import * as React from "react";
import { useState, useEffect, useCallback } from "react";
import {
  Loader2,
  Sparkles,
  Download,
  BookOpen,
  FileText,
  Link,
  Code,
  Database,
  Layers,
  ChevronDown
} from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MarkdownMessage } from "@/components/chat/markdown-message";

interface ProjectDocumentation {
  id: string;
  project_id: string;
  doc_type: string;
  content: string;
  created_at: string;
}

interface DocumentationTabProps {
  projectId: string;
}

const DOC_TYPES = [
  { id: "readme", label: "README.md", icon: BookOpen, description: "Project overview, features, and setup instructions." },
  { id: "api", label: "API Documentation", icon: Link, description: "Detailed listing of routes, schemas, methods, and payloads." },
  { id: "function", label: "Functions list", icon: Code, description: "Core functions, inputs, outputs, and logic descriptions." },
  { id: "class", label: "Classes list", icon: FileText, description: "Object classes, constructors, methods, and inheritances." },
  { id: "database", label: "Database Schema", icon: Database, description: "Relational database tables, fields, types, and model mappings." },
  { id: "architecture", label: "System Architecture", icon: Layers, description: "Design patterns, directories organization, flows, and setups." },
];

export function DocumentationTab({ projectId }: DocumentationTabProps) {
  const [activeType, setActiveType] = useState<string>("readme");
  const [documentations, setDocumentations] = useState<Record<string, ProjectDocumentation>>({});
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);

  const loadDocumentations = useCallback(async () => {
    try {
      const { data } = await apiClient.get<ProjectDocumentation[]>(`/api/projects/${projectId}/docs`);
      const map: Record<string, ProjectDocumentation> = {};
      data.forEach((doc) => {
        map[doc.doc_type] = doc;
      });
      setDocumentations(map);
    } catch {
      toast.error("Could not load codebase documentation logs.");
    } finally {
      setIsLoadingList(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadDocumentations();
  }, [loadDocumentations]);

  const handleGenerate = async () => {
    setIsGenerating(true);
    toast.info("Generating documentation with Gemini AI. This may take up to a minute...");
    try {
      const { data } = await apiClient.post<ProjectDocumentation>(`/api/projects/${projectId}/docs`, {
        doc_type: activeType,
      });
      setDocumentations((prev) => ({ ...prev, [activeType]: data }));
      toast.success("Documentation compiled successfully!");
    } catch {
      toast.error("Generation failed. Please verify API configuration keys.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExport = async (format: "pdf" | "markdown" | "html") => {
    const currentDoc = documentations[activeType];
    if (!currentDoc) return;
    try {
      toast.info(`Preparing ${format.toUpperCase()} file download...`);
      
      const response = await apiClient.get(`/api/projects/${projectId}/docs/${activeType}/export/${format}`, {
        responseType: "blob"
      });

      const contentType = response.headers["content-type"];
      const blob = new Blob([response.data], { 
        type: typeof contentType === "string" ? contentType : undefined 
      });
      
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const ext = format === "markdown" ? "md" : format;
      link.setAttribute("download", `${activeType}_doc.${ext}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      toast.success("Document exported successfully");
    } catch {
      toast.error("Could not export document.");
    } finally {
      setIsExportMenuOpen(false);
    }
  };

  const currentDoc = documentations[activeType];

  return (
    <div className="flex h-[60vh] gap-6 rounded-xl border border-border overflow-hidden bg-card">
      
      {/* Left Sidebar: Select Documentation Type */}
      <div className="w-80 border-r border-border flex flex-col min-h-0 bg-muted/5">
        <div className="p-4 border-b border-border bg-muted/15 shrink-0">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Documentation Types</h3>
        </div>
        
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {DOC_TYPES.map((type) => {
            const Icon = type.icon;
            const isSelected = activeType === type.id;
            const isCompiled = !!documentations[type.id];
            
            return (
              <button
                key={type.id}
                onClick={() => {
                  setActiveType(type.id);
                  setIsExportMenuOpen(false);
                }}
                className={cn(
                  "w-full text-left p-2.5 rounded-lg border transition-all text-xs flex items-start gap-2.5 hover:bg-accent/40",
                  isSelected
                    ? "bg-primary/10 border-primary/20 text-primary font-medium"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className={cn("h-4 w-4 shrink-0 mt-0.5", isSelected ? "text-primary" : "text-muted-foreground")} />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 justify-between">
                    <span className="font-semibold">{type.label}</span>
                    {isCompiled && (
                      <span className="bg-emerald-500/10 text-emerald-500 text-[9px] px-1 rounded font-bold uppercase tracking-wider shrink-0">
                        Ready
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground/75 mt-0.5 truncate">{type.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right side: Code Doc Workspace */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden select-text">
        {isLoadingList ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Header / Exporter Toolbar */}
            <div className="px-6 py-4 border-b border-border bg-muted/10 flex items-center justify-between shrink-0 select-none">
              <div>
                <h4 className="font-semibold text-sm">
                  {DOC_TYPES.find((t) => t.id === activeType)?.label}
                </h4>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {DOC_TYPES.find((t) => t.id === activeType)?.description}
                </p>
              </div>

              {currentDoc && (
                <div className="relative">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5"
                    onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
                  >
                    <Download className="h-3.5 w-3.5" />
                    Export Document
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                  
                  {isExportMenuOpen && (
                    <div className="absolute right-0 mt-1 w-36 rounded-md border border-border bg-card shadow-lg z-20 overflow-hidden">
                      <div className="py-1">
                        <button
                          onClick={() => handleExport("markdown")}
                          className="w-full text-left px-3.5 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground text-foreground flex items-center gap-1.5"
                        >
                          📄 Markdown (.md)
                        </button>
                        <button
                          onClick={() => handleExport("pdf")}
                          className="w-full text-left px-3.5 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground text-foreground flex items-center gap-1.5"
                        >
                          📕 PDF Report (.pdf)
                        </button>
                        <button
                          onClick={() => handleExport("html")}
                          className="w-full text-left px-3.5 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground text-foreground flex items-center gap-1.5"
                        >
                          🌐 HTML Page (.html)
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Main Document Content Area */}
            <div className="flex-1 overflow-y-auto p-6 min-h-0 bg-card">
              {isGenerating ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground select-none">
                  <Loader2 className="h-7 w-7 animate-spin text-primary mb-3.5" />
                  <span className="text-xs font-semibold">Compiling workspace using Gemini AI...</span>
                  <span className="text-[10px] text-muted-foreground/60 mt-1">This can take up to 45 seconds depending on repository size.</span>
                </div>
              ) : currentDoc ? (
                <div className="prose dark:prose-invert max-w-none prose-sm leading-relaxed">
                  <MarkdownMessage content={currentDoc.content} />
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center p-8 select-none">
                  <Sparkles className="h-10 w-10 text-primary/40 mb-3 stroke-[1.2]" />
                  <h5 className="font-semibold text-sm text-foreground/90">Documentation Not Compiled</h5>
                  <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                    No documentation has been generated for this module yet. Run the AI Writer tool to analyze codebase files.
                  </p>
                  <Button variant="default" size="sm" className="mt-4 gap-1.5" onClick={handleGenerate}>
                    <Sparkles className="h-3.5 w-3.5" />
                    Compile with AI Writer
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
