"use client";

import * as React from "react";
import { useState, useEffect, useCallback, useRef } from "react";
import {
  Loader2,
  Sparkles,
  Download,
  Terminal,
  Grid,
  Database,
  GitMerge,
  Workflow,
  KeyRound,
  History,
  HardDrive,
  Cpu,
  ChevronDown
} from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MarkdownMessage } from "@/components/chat/markdown-message";

interface ProjectArchitecture {
  id: string;
  project_id: string;
  architecture_type: string;
  content: string;
  created_at: string;
}

interface ArchitectureTabProps {
  projectId: string;
}

const ARCH_TYPES = [
  { id: "system_design", label: "System Design", icon: Grid, description: "System design patterns, modular layers and requirements." },
  { id: "architecture_diagram", label: "Architecture Diagram", icon: Cpu, description: "General component interactions map." },
  { id: "database_schema", label: "Database Schema", icon: Database, description: "ER diagrams mapping database relationships." },
  { id: "folder_structure", label: "Folder Structure", icon: HardDrive, description: "Directories layouts flowchart mapping." },
  { id: "api_flow", label: "API Flow", icon: GitMerge, description: "End-to-end HTTP request-response flowcharts." },
  { id: "auth_flow", label: "Authentication Flow", icon: KeyRound, description: "JWT header checks and credential flows." },
  { id: "sequence_diagram", label: "Sequence Diagram", icon: History, description: "Step-by-step process timelines diagram." },
  { id: "component_diagram", label: "Component Diagram", icon: Workflow, description: "Modular code packaging dependencies." },
  { id: "deployment_diagram", label: "Deployment Diagram", icon: Terminal, description: "Physical topology layout, hosting and load balancers." },
];

export function MermaidRenderer({ chart }: { chart: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>("");
  const [isRenderError, setIsRenderError] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !chart) return;
    
    const renderChart = async () => {
      try {
        setIsRenderError(false);
        const win = window as unknown as {
          mermaid?: {
            initialize: (cfg: Record<string, unknown>) => void;
            render: (id: string, text: string) => Promise<{ svg: string }>;
          };
        };
        let mermaid = win.mermaid;
        if (!mermaid) {
          const script = document.createElement("script");
          script.src = "https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js";
          script.async = true;
          document.body.appendChild(script);
          
          await new Promise((resolve) => {
            script.onload = resolve;
          });
          mermaid = win.mermaid;
          if (mermaid) {
            mermaid.initialize({
              startOnLoad: false,
              theme: "dark",
              securityLevel: "loose"
            });
          }
        }
        
        if (mermaid) {
          const id = `mermaid-chart-${Math.random().toString(36).slice(2)}`;
          const { svg: svgCode } = await mermaid.render(id, chart);
          setSvg(svgCode);
        } else {
          setIsRenderError(true);
        }
      } catch (err) {
        console.error("Mermaid render error:", err);
        setIsRenderError(true);
      }
    };

    renderChart();
  }, [chart]);

  if (isRenderError) {
    return (
      <div className="p-4 bg-red-500/5 text-red-500 rounded-lg border border-red-500/20 text-xs font-mono select-text whitespace-pre overflow-auto max-h-64">
        Failed to render Mermaid chart markup:<br/>{chart}
      </div>
    );
  }

  if (!svg) {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-muted/5 rounded-lg border border-border h-48 select-none">
        <Loader2 className="h-6 w-6 animate-spin text-primary mb-2" />
        <span className="text-xs text-muted-foreground">Rendering architecture diagram...</span>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      data-mermaid-svg="true"
      className="p-6 bg-zinc-950 rounded-lg border border-border overflow-auto flex justify-center bg-zinc-950/70 shadow-inner" 
      dangerouslySetInnerHTML={{ __html: svg }} 
    />
  );
}

export function ArchitectureTab({ projectId }: ArchitectureTabProps) {
  const [activeType, setActiveType] = useState<string>("system_design");
  const [architectures, setArchitectures] = useState<Record<string, ProjectArchitecture>>({});
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);

  const loadArchitectures = useCallback(async () => {
    try {
      const { data } = await apiClient.get<ProjectArchitecture[]>(`/api/projects/${projectId}/architectures`);
      const map: Record<string, ProjectArchitecture> = {};
      data.forEach((arch) => {
        map[arch.architecture_type] = arch;
      });
      setArchitectures(map);
    } catch {
      toast.error("Could not load codebase architecture blueprints.");
    } finally {
      setIsLoadingList(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadArchitectures();
  }, [loadArchitectures]);

  const handleGenerate = async () => {
    setIsGenerating(true);
    toast.info("Compiling architecture blueprints with Gemini AI. This may take up to a minute...");
    try {
      const { data } = await apiClient.post<ProjectArchitecture>(`/api/projects/${projectId}/architectures`, {
        architecture_type: activeType,
      });
      setArchitectures((prev) => ({ ...prev, [activeType]: data }));
      toast.success("Architecture compiled successfully!");
    } catch {
      toast.error("Generation failed. Please verify API configuration keys.");
    } finally {
      setIsGenerating(false);
    }
  };

  const currentArch = architectures[activeType];

  // Helper to extract mermaid code block from markdown
  const extractMermaidCode = (mdContent: string): string | null => {
    const match = mdContent.match(/```mermaid([\s\S]*?)```/);
    return match ? match[1].trim() : null;
  };

  const handleExport = (format: "png" | "svg" | "pdf") => {
    if (!currentArch) return;
    
    // Find the rendered SVG element
    const container = document.querySelector("[data-mermaid-svg='true'] svg");
    if (!container) {
      toast.error("No rendered diagram found to export. Make sure it is compiled.");
      return;
    }
    
    const svgElement = container as SVGElement;
    const filename = `${activeType}_blueprint`;

    if (format === "svg") {
      const svgString = new XMLSerializer().serializeToString(svgElement);
      const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `${filename}.svg`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Diagram exported as SVG!");
    } 
    else if (format === "png") {
      const svgString = new XMLSerializer().serializeToString(svgElement);
      const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
      const URL = window.URL || window.webkitURL || window;
      const blobURL = URL.createObjectURL(svgBlob);
      
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement("canvas");
        // Ensure high DPI export
        const boundingBox = svgElement.getBoundingClientRect();
        canvas.width = (boundingBox.width || 1200) * 2;
        canvas.height = (boundingBox.height || 800) * 2;
        
        const context = canvas.getContext("2d");
        if (context) {
          context.fillStyle = "#09090b"; // Match slate/zinc dark background
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.scale(2, 2);
          context.drawImage(image, 0, 0, boundingBox.width || 1200, boundingBox.height || 800);
          
          const pngURL = canvas.toDataURL("image/png");
          const downloadLink = document.createElement("a");
          downloadLink.href = pngURL;
          downloadLink.setAttribute("download", `${filename}.png`);
          document.body.appendChild(downloadLink);
          downloadLink.click();
          downloadLink.remove();
          toast.success("Diagram exported as PNG!");
        }
        URL.revokeObjectURL(blobURL);
      };
      image.src = blobURL;
    }
    else if (format === "pdf") {
      // Open clean print layout page for PDF print capture
      const printWindow = window.open("", "_blank");
      if (printWindow) {
        printWindow.document.write(`
          <html>
          <head>
            <title>${filename.toUpperCase()}</title>
            <style>
              body {
                margin: 0;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                height: 100vh;
                background-color: white;
                font-family: system-ui, sans-serif;
                padding: 40px;
                box-sizing: border-box;
              }
              h1 {
                font-size: 18px;
                margin-bottom: 20px;
                color: #09090b;
              }
              svg {
                max-width: 100%;
                max-height: 80%;
              }
            </style>
          </head>
          <body>
            <h1>${activeType.replace("_", " ").toUpperCase()}</h1>
            ${svgElement.outerHTML}
            <script>
              window.onload = () => {
                window.print();
                window.close();
              };
            </script>
          </body>
          </html>
        `);
        printWindow.document.close();
      }
    }
    setIsExportMenuOpen(false);
  };

  const mermaidCode = currentArch ? extractMermaidCode(currentArch.content) : null;

  return (
    <div className="flex h-[60vh] gap-6 rounded-xl border border-border overflow-hidden bg-card">
      
      {/* Left Sidebar: Select Architecture Type */}
      <div className="w-80 border-r border-border flex flex-col min-h-0 bg-muted/5 select-none">
        <div className="p-4 border-b border-border bg-muted/15 shrink-0">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Architecture Types</h3>
        </div>
        
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {ARCH_TYPES.map((type) => {
            const Icon = type.icon;
            const isSelected = activeType === type.id;
            const isCompiled = !!architectures[type.id];
            
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

      {/* Right side: Blueprint Content Workspace */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden select-text">
        {isLoadingList ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Header / Actions Export */}
            <div className="px-6 py-4 border-b border-border bg-muted/10 flex items-center justify-between shrink-0 select-none">
              <div>
                <h4 className="font-semibold text-sm">
                  {ARCH_TYPES.find((t) => t.id === activeType)?.label}
                </h4>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {ARCH_TYPES.find((t) => t.id === activeType)?.description}
                </p>
              </div>

              {currentArch && mermaidCode && (
                <div className="relative">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5"
                    onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
                  >
                    <Download className="h-3.5 w-3.5" />
                    Export Diagram
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                  
                  {isExportMenuOpen && (
                    <div className="absolute right-0 mt-1 w-36 rounded-md border border-border bg-card shadow-lg z-20 overflow-hidden">
                      <div className="py-1">
                        <button
                          onClick={() => handleExport("svg")}
                          className="w-full text-left px-3.5 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground text-foreground flex items-center gap-1.5"
                        >
                          📐 SVG Vector (.svg)
                        </button>
                        <button
                          onClick={() => handleExport("png")}
                          className="w-full text-left px-3.5 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground text-foreground flex items-center gap-1.5"
                        >
                          🖼️ PNG Image (.png)
                        </button>
                        <button
                          onClick={() => handleExport("pdf")}
                          className="w-full text-left px-3.5 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground text-foreground flex items-center gap-1.5"
                        >
                          📕 PDF Document (.pdf)
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Content blueprint detail */}
            <div className="flex-1 overflow-y-auto p-6 min-h-0 bg-card space-y-6">
              {isGenerating ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground select-none">
                  <Loader2 className="h-7 w-7 animate-spin text-primary mb-3.5" />
                  <span className="text-xs font-semibold">Compiling blueprint layouts using Gemini AI...</span>
                  <span className="text-[10px] text-muted-foreground/60 mt-1">This can take up to 45 seconds to inspect imports and index relations.</span>
                </div>
              ) : currentArch ? (
                <div className="space-y-6">
                  {/* If Mermaid code is parsed out, render it visually */}
                  {mermaidCode && (
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider select-none">Visual System Chart</label>
                      <MermaidRenderer chart={mermaidCode} />
                    </div>
                  )}
                  
                  {/* Detailed Description */}
                  <div className="space-y-1.5">
                    {mermaidCode && <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider select-none">Architecture Details</label>}
                    <div className="prose dark:prose-invert max-w-none prose-sm leading-relaxed">
                      <MarkdownMessage content={currentArch.content} />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center p-8 select-none">
                  <Sparkles className="h-10 w-10 text-primary/40 mb-3 stroke-[1.2]" />
                  <h5 className="font-semibold text-sm text-foreground/90">Blueprint Layout Not Compiled</h5>
                  <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                    No structural blueprints have been compiled for this module yet. Run the AI Solutions Architect tool to analyze.
                  </p>
                  <Button variant="default" size="sm" className="mt-4 gap-1.5" onClick={handleGenerate}>
                    <Sparkles className="h-3.5 w-3.5" />
                    Compile with Solutions Architect
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
