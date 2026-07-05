"use client";

import * as React from "react";
import { useState, useEffect, useCallback } from "react";
import {
  Loader2,
  Sparkles,
  Download,
  AlertTriangle,
  CheckCircle2,
  Shield,
  Zap,
  LayoutGrid,
  Code2,
  BookOpen,
  TestTube
} from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CodeReviewIssue {
  id: string;
  file_path: string;
  line_number: number | null;
  category: string;
  title: string;
  description: string;
  severity: "low" | "medium" | "high" | "critical";
  recommended_fix: string;
  code_example: string | null;
  created_at: string;
}

interface CodeReviewReport {
  id: string;
  project_id: string;
  quality_score: number;
  security_score: number;
  performance_score: number;
  architecture_score: number;
  summary: string | null;
  created_at: string;
  issues?: CodeReviewIssue[];
}

interface CodeReviewTabProps {
  projectId: string;
}

export function CodeReviewTab({ projectId }: CodeReviewTabProps) {
  const [reports, setReports] = useState<CodeReviewReport[]>([]);
  const [activeReport, setActiveReport] = useState<CodeReviewReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isReviewing, setIsReviewing] = useState(false);
  const [expandedIssueId, setExpandedIssueId] = useState<string | null>(null);

  // Filters state
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedSeverity, setSelectedSeverity] = useState<string>("all");

  const loadReports = useCallback(async (selectFirst = false) => {
    try {
      const { data } = await apiClient.get<CodeReviewReport[]>(`/api/projects/${projectId}/reviews`);
      if (data.length > 0 && (selectFirst || !activeReport)) {
        // Fetch full report details with issues list
        apiClient.get<CodeReviewReport>(`/api/reviews/${data[0].id}`).then(({ data: fullReport }) => {
          setActiveReport(fullReport);
        });
      }
      setReports(data);
    } catch {
      toast.error("Could not load codebase review reports.");
    } finally {
      setIsLoading(false);
    }
  }, [projectId, activeReport]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  // Polling hook for background tasks
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const pollStatus = async () => {
      try {
        const { data } = await apiClient.get<CodeReviewReport[]>(`/api/projects/${projectId}/reviews`);
        if (data.length > 0) {
          const newest = data[0];
          // Check if it's finished indexing or has real scores
          if (newest.summary && !newest.summary.includes("currently analyzing")) {
            if (intervalId) clearInterval(intervalId);
            setIsReviewing(false);
            
            // Fetch detailed issues
            const { data: full } = await apiClient.get<CodeReviewReport>(`/api/reviews/${newest.id}`);
            setActiveReport(full);
            setReports(data);
            toast.success("AI Code Review completed successfully!");
          }
        }
      } catch {
        if (intervalId) clearInterval(intervalId);
        setIsReviewing(false);
      }
    };

    if (isReviewing) {
      intervalId = setInterval(pollStatus, 3000);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isReviewing, projectId]);

  const handleRunReview = async () => {
    setIsReviewing(true);
    try {
      await apiClient.post(`/api/projects/${projectId}/review`);
      toast.success("Code Review launched in the background!");
    } catch (err) {
      setIsReviewing(false);
      let detail = "Failed to trigger code review.";
      if (err && typeof err === "object" && "response" in err) {
        const res = (err as { response?: { data?: { detail?: string } } }).response;
        if (res?.data?.detail) {
          detail = res.data.detail;
        }
      }
      toast.error(detail);
    }
  };

  const handleSelectReport = async (reportId: string) => {
    setIsLoading(true);
    setExpandedIssueId(null);
    try {
      const { data } = await apiClient.get<CodeReviewReport>(`/api/reviews/${reportId}`);
      setActiveReport(data);
    } catch {
      toast.error("Failed to load review details.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = async (format: "pdf" | "markdown" | "json") => {
    if (!activeReport) return;
    try {
      toast.info(`Preparing ${format.toUpperCase()} export...`);
      const response = await apiClient.get(`/api/reviews/${activeReport.id}/export/${format}`, {
        responseType: "blob",
      });
      const contentType = response.headers["content-type"];
      const blob = new Blob([response.data], { 
        type: typeof contentType === "string" ? contentType : undefined 
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const ext = format === "markdown" ? "md" : format;
      link.setAttribute("download", `codereview_${activeReport.id}.${ext}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Report downloaded successfully");
    } catch {
      toast.error("Export failed. Please try again.");
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical":
        return "bg-red-500/10 text-red-500 border-red-500/20";
      case "high":
        return "bg-orange-500/10 text-orange-500 border-orange-500/20";
      case "medium":
        return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
      case "low":
        return "bg-blue-500/10 text-blue-500 border-blue-500/20";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category.toLowerCase()) {
      case "security":
        return <Shield className="h-3.5 w-3.5" />;
      case "performance":
        return <Zap className="h-3.5 w-3.5" />;
      case "architecture":
        return <LayoutGrid className="h-3.5 w-3.5" />;
      case "complexity":
        return <Code2 className="h-3.5 w-3.5" />;
      case "documentation":
        return <BookOpen className="h-3.5 w-3.5" />;
      case "testing":
        return <TestTube className="h-3.5 w-3.5" />;
      default:
        return <CheckCircle2 className="h-3.5 w-3.5" />;
    }
  };

  // Filtering issues list
  const filteredIssues = activeReport?.issues?.filter((issue) => {
    const matchesCategory = selectedCategory === "all" || issue.category.toLowerCase() === selectedCategory.toLowerCase();
    const matchesSeverity = selectedSeverity === "all" || issue.severity.toLowerCase() === selectedSeverity.toLowerCase();
    return matchesCategory && matchesSeverity;
  }) || [];

  // Unique categories count pills
  const categoriesList = activeReport?.issues
    ? Array.from(new Set(activeReport.issues.map((i) => i.category.toLowerCase())))
    : [];

  if (isLoading && !activeReport) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Run Code Review Header Call-to-action */}
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div>
          <h3 className="text-lg font-bold">Code Quality Analysis</h3>
          <p className="text-xs text-muted-foreground">Audit your repository codebase for code patterns, security holes, and complexity issues.</p>
        </div>
        <div className="flex items-center gap-2">
          {reports.length > 0 && (
            <select
              value={activeReport?.id || ""}
              onChange={(e) => handleSelectReport(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {reports.map((r) => (
                <option key={r.id} value={r.id}>
                  {new Date(r.created_at).toLocaleDateString()} - Score: {r.quality_score}
                </option>
              ))}
            </select>
          )}

          <Button onClick={handleRunReview} size="sm" className="gap-1.5 text-xs" disabled={isReviewing}>
            {isReviewing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Analyzing files...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Run Code Review
              </>
            )}
          </Button>
        </div>
      </div>

      {reports.length === 0 && !isReviewing ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center bg-muted/5">
          <AlertTriangle className="h-10 w-10 text-yellow-500/80 stroke-[1.2] mb-3" />
          <h4 className="font-semibold text-sm">No analysis reports available</h4>
          <p className="text-xs text-muted-foreground max-w-sm mt-1 mb-6">
            Run your first AI Code Review to inspect project complexity, vulnerabilities, and coding patterns.
          </p>
          <Button onClick={handleRunReview} size="sm" className="gap-1.5">
            <Sparkles className="h-4 w-4" />
            Analyze Repository
          </Button>
        </div>
      ) : isReviewing && !activeReport ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border py-16 text-center bg-muted/5 space-y-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary stroke-[1.2]" />
          <div>
            <h4 className="font-semibold text-sm">AI review is scanning files</h4>
            <p className="text-xs text-muted-foreground max-w-xs mt-1">
              Gemini is auditing security tags and complexity algorithms. This takes up to 30 seconds.
            </p>
          </div>
        </div>
      ) : (
        activeReport && (
          <div className="space-y-6">
            {/* Score Grid Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { title: "Overall Quality", score: activeReport.quality_score, color: "text-indigo-500" },
                { title: "Security Health", score: activeReport.security_score, color: "text-red-500" },
                { title: "Performance rating", score: activeReport.performance_score, color: "text-amber-500" },
                { title: "Architecture score", score: activeReport.architecture_score, color: "text-emerald-500" }
              ].map((card, i) => (
                <div key={i} className="rounded-xl border border-border bg-card p-4 shadow-sm flex flex-col justify-between">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{card.title}</span>
                  <div className="flex items-baseline gap-1 mt-3">
                    <span className={cn("text-3xl font-extrabold tracking-tight", card.color)}>{card.score}</span>
                    <span className="text-xs text-muted-foreground">/100</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Executive Summary */}
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Executive Review Summary</h4>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1" onClick={() => handleExport("pdf")}>
                    <Download className="h-3 w-3" />
                    PDF
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1" onClick={() => handleExport("markdown")}>
                    <Download className="h-3 w-3" />
                    Markdown
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1" onClick={() => handleExport("json")}>
                    <Download className="h-3 w-3" />
                    JSON
                  </Button>
                </div>
              </div>
              <p className="text-xs leading-relaxed text-foreground/80 whitespace-pre-wrap">{activeReport.summary}</p>
            </div>

            {/* Filter Pills Workspace */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-border pt-4">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-semibold uppercase text-muted-foreground mr-1.5">Category:</span>
                <button
                  onClick={() => setSelectedCategory("all")}
                  className={cn(
                    "px-2.5 py-0.5 rounded text-[10px] uppercase font-bold border transition-colors",
                    selectedCategory === "all"
                      ? "bg-primary/10 border-primary text-primary"
                      : "bg-background border-border text-muted-foreground hover:bg-accent"
                  )}
                >
                  All
                </button>
                {categoriesList.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={cn(
                      "px-2.5 py-0.5 rounded text-[10px] uppercase font-bold border transition-colors",
                      selectedCategory === cat
                        ? "bg-primary/10 border-primary text-primary"
                        : "bg-background border-border text-muted-foreground hover:bg-accent"
                    )}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-semibold uppercase text-muted-foreground mr-1.5">Severity:</span>
                {["all", "critical", "high", "medium", "low"].map((sev) => (
                  <button
                    key={sev}
                    onClick={() => setSelectedSeverity(sev)}
                    className={cn(
                      "px-2 py-0.5 rounded text-[10px] uppercase font-bold border transition-colors",
                      selectedSeverity === sev
                        ? "bg-primary/10 border-primary text-primary"
                        : "bg-background border-border text-muted-foreground hover:bg-accent"
                    )}
                  >
                    {sev}
                  </button>
                ))}
              </div>
            </div>

            {/* Issues List Container */}
            <div className="space-y-3">
              {filteredIssues.length === 0 ? (
                <div className="text-center py-8 text-xs text-muted-foreground border border-dashed border-border rounded-xl">
                  No issues matches the current filter settings.
                </div>
              ) : (
                filteredIssues.map((issue) => {
                  const isExpanded = expandedIssueId === issue.id;
                  return (
                    <div
                      key={issue.id}
                      className={cn(
                        "rounded-xl border bg-card transition-all overflow-hidden",
                        isExpanded ? "border-primary/50 shadow-sm" : "border-border hover:border-foreground/20"
                      )}
                    >
                      {/* Issue summary header */}
                      <div
                        onClick={() => setExpandedIssueId(isExpanded ? null : issue.id)}
                        className="p-4 flex items-center justify-between gap-4 cursor-pointer select-none"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className={cn("px-2 py-0.5 rounded text-[9px] uppercase font-bold border shrink-0", getSeverityColor(issue.severity))}>
                            {issue.severity}
                          </span>
                          <span className="text-muted-foreground shrink-0">{getCategoryIcon(issue.category)}</span>
                          <h5 className="font-semibold text-xs text-foreground truncate">{issue.title}</h5>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[150px]">
                            {issue.file_path.split("/").pop()}
                            {issue.line_number ? `:L${issue.line_number}` : ""}
                          </span>
                          <span className="text-muted-foreground/60 text-xs">{isExpanded ? "▲" : "▼"}</span>
                        </div>
                      </div>

                      {/* Issue description details body */}
                      {isExpanded && (
                        <div className="px-4 pb-4 pt-1 border-t border-border bg-muted/5 text-xs space-y-3">
                          <div>
                            <span className="font-bold text-muted-foreground uppercase tracking-wider text-[10px]">File Location:</span>
                            <p className="font-mono text-foreground mt-0.5 text-[11px]">{issue.file_path}{issue.line_number ? ` (Line ${issue.line_number})` : ""}</p>
                          </div>
                          <div>
                            <span className="font-bold text-muted-foreground uppercase tracking-wider text-[10px]">Description:</span>
                            <p className="text-foreground/80 mt-0.5 leading-relaxed">{issue.description}</p>
                          </div>
                          <div>
                            <span className="font-bold text-muted-foreground uppercase tracking-wider text-[10px]">Recommended Fix:</span>
                            <p className="text-foreground/80 mt-0.5 leading-relaxed">{issue.recommended_fix}</p>
                          </div>
                          {issue.code_example && (
                            <div>
                              <span className="font-bold text-muted-foreground uppercase tracking-wider text-[10px]">Corrected Code Example:</span>
                              <pre className="mt-1 p-3 rounded bg-muted font-mono text-[10px] leading-relaxed overflow-x-auto border border-border select-text">
                                {issue.code_example}
                              </pre>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

          </div>
        )
      )}
    </div>
  );
}
