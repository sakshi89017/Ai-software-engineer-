"use client";

import * as React from "react";
import { useState, useEffect, useCallback } from "react";
import {
  Loader2,
  Sparkles,
  GitPullRequest,
  CheckCircle,
  FileCode,
  FileText,
  AlertTriangle
} from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MarkdownMessage } from "@/components/chat/markdown-message";

interface ProjectAgentTask {
  id: string;
  project_id: string;
  issue_content: string;
  implementation_plan: string | null;
  proposed_changes: string | null;
  proposed_tests: string | null;
  proposed_docs: string | null;
  pr_summary: string | null;
  status: string;
  created_at: string;
}

interface AgentTabProps {
  projectId: string;
}

export function AgentTab({ projectId }: AgentTabProps) {
  const [tasks, setTasks] = useState<ProjectAgentTask[]>([]);
  const [activeTask, setActiveTask] = useState<ProjectAgentTask | null>(null);
  
  // Loaders
  const [isLoadingTasks, setIsLoadingTasks] = useState(true);
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
  const [isExecutingPlan, setIsExecutingPlan] = useState(false);
  const [isApplyingChanges, setIsApplyingChanges] = useState(false);

  // Form Inputs
  const [issueInput, setIssueInput] = useState("");

  const loadTasks = useCallback(async () => {
    try {
      const { data } = await apiClient.get<ProjectAgentTask[]>(`/api/projects/${projectId}/agent/tasks`);
      setTasks(data);
      if (data.length > 0) {
        setActiveTask(data[0]);
      }
    } catch {
      toast.error("Could not load developer agent tasks.");
    } finally {
      setIsLoadingTasks(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!issueInput.trim()) return;

    setIsGeneratingPlan(true);
    toast.info("AI Agent is scanning the repository structure and compiling plan...");
    try {
      const { data } = await apiClient.post<ProjectAgentTask>(`/api/projects/${projectId}/agent/tasks`, {
        issue_content: issueInput.trim()
      });
      setTasks((prev) => [data, ...prev]);
      setActiveTask(data);
      setIssueInput("");
      toast.success("Implementation Plan generated successfully!");
    } catch {
      toast.error("Failed to generate plan. Please verify API configuration keys.");
    } finally {
      setIsGeneratingPlan(false);
    }
  };

  const handleExecute = async () => {
    if (!activeTask) return;

    setIsExecutingPlan(true);
    toast.info("AI Agent is writing code modifications, generating unit tests, and compiling documentation...");
    try {
      const { data } = await apiClient.post<ProjectAgentTask>(`/api/agent/tasks/${activeTask.id}/execute`);
      setTasks((prev) => prev.map((t) => (t.id === data.id ? data : t)));
      setActiveTask(data);
      toast.success("Proposed code modifications and tests compiled!");
    } catch {
      toast.error("Code generation failed.");
    } finally {
      setIsExecutingPlan(false);
    }
  };

  const handleApply = async () => {
    if (!activeTask) return;

    setIsApplyingChanges(true);
    try {
      const { data } = await apiClient.post<ProjectAgentTask>(`/api/agent/tasks/${activeTask.id}/apply`);
      setTasks((prev) => prev.map((t) => (t.id === data.id ? data : t)));
      setActiveTask(data);
      toast.success("Repository files modified and tests created successfully!");
    } catch {
      toast.error("Failed to apply code modifications.");
    } finally {
      setIsApplyingChanges(false);
    }
  };

  // Parsers for changes JSON strings
  const proposedChangesMap = activeTask?.proposed_changes ? JSON.parse(activeTask.proposed_changes) : {};
  const proposedTestsMap = activeTask?.proposed_tests ? JSON.parse(activeTask.proposed_tests) : {};

  return (
    <div className="flex h-[60vh] gap-6 rounded-xl border border-border overflow-hidden bg-card select-none">
      
      {/* Left panel: Task lists and Issue creator */}
      <div className="w-80 border-r border-border flex flex-col min-h-0 bg-muted/5 p-4 space-y-4 shrink-0">
        <div className="flex items-center gap-2 border-b border-border pb-3 shrink-0">
          <Sparkles className="h-4.5 w-4.5 text-primary animate-pulse" />
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">AI Developer Agent</h3>
        </div>

        {/* Issue pasted area */}
        <form onSubmit={handleCreateTask} className="space-y-2 shrink-0">
          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Describe / Paste GitHub Issue</label>
          <textarea
            value={issueInput}
            onChange={(e) => setIssueInput(e.target.value)}
            placeholder="e.g. Add validation controls to project cloning routes, throwing HTTP 400 for empty URLs..."
            className="w-full h-20 rounded-lg border border-input bg-card px-2.5 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none select-text"
          />
          <Button type="submit" size="sm" className="w-full font-semibold gap-1" disabled={isGeneratingPlan || !issueInput.trim()}>
            {isGeneratingPlan ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            Generate Plan
          </Button>
        </form>

        {/* List of Tasks */}
        <div className="flex-1 overflow-y-auto space-y-1">
          <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Task History</label>
          {isLoadingTasks ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : tasks.length === 0 ? (
            <p className="text-[10px] text-muted-foreground italic text-center py-4">No agent tasks triggered yet.</p>
          ) : (
            tasks.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTask(t)}
                className={cn(
                  "w-full text-left p-2.5 rounded-lg border text-xs flex flex-col gap-1 transition-all hover:bg-accent/40",
                  activeTask?.id === t.id
                    ? "bg-primary/10 border-primary/20 text-primary"
                    : "border-transparent text-muted-foreground"
                )}
              >
                <span className="font-semibold truncate w-full">{t.issue_content}</span>
                <span className={cn(
                  "text-[8px] font-bold uppercase tracking-wider px-1 rounded w-fit mt-0.5",
                  t.status === "applied" ? "bg-emerald-500/10 text-emerald-500" : t.status === "changes_generated" ? "bg-blue-500/10 text-blue-500" : "bg-amber-500/10 text-amber-500"
                )}>
                  {t.status.replace("_", " ")}
                </span>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Right panel: Active Task workspace details */}
      <div className="flex-1 flex flex-col min-h-0 select-text">
        {activeTask ? (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Header title */}
            <div className="px-6 py-4 border-b border-border bg-muted/10 flex items-center justify-between shrink-0 select-none">
              <div>
                <h4 className="font-bold text-sm truncate max-w-md">{activeTask.issue_content}</h4>
                <p className="text-[9px] text-muted-foreground mt-0.5">
                  Created {new Date(activeTask.created_at).toLocaleString()} | Status: <span className="font-semibold text-foreground/80">{activeTask.status}</span>
                </p>
              </div>

              {/* Status Action CTAs */}
              <div className="flex items-center gap-2">
                {activeTask.status === "plan_generated" && (
                  <Button
                    size="sm"
                    className="h-8 gap-1 font-semibold"
                    onClick={handleExecute}
                    disabled={isExecutingPlan}
                  >
                    {isExecutingPlan ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    Approve Plan & Generate Changes
                  </Button>
                )}
                {activeTask.status === "changes_generated" && (
                  <Button
                    size="sm"
                    variant="default"
                    className="h-8 gap-1 font-semibold hover:shadow-lg hover:shadow-primary/10"
                    onClick={handleApply}
                    disabled={isApplyingChanges}
                  >
                    {isApplyingChanges ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
                    Apply Changes to Repository
                  </Button>
                )}
                {activeTask.status === "applied" && (
                  <div className="flex items-center gap-1 text-emerald-500 text-xs font-semibold bg-emerald-500/10 p-1.5 px-3 rounded-lg">
                    <CheckCircle className="h-4 w-4" />
                    <span>Changes Applied Successfully</span>
                  </div>
                )}
              </div>
            </div>

            {/* Content area split tabs or scroll views */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 min-h-0 bg-card">
              
              {/* Safety notice during change confirmations */}
              {activeTask.status === "changes_generated" && (
                <div className="bg-amber-500/10 border border-amber-500/20 text-amber-500 p-3 rounded-lg flex items-start gap-2.5 text-xs select-none">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Plan Approval & Safe Environment:</span>
                    <p className="text-[10px] text-amber-600/90 mt-0.5">
                      The AI agent will never alter repository source files automatically without your approval. Click &quot;Apply Changes to Repository&quot; above to save the code diff modifications permanently.
                    </p>
                  </div>
                </div>
              )}

              {/* 1. Implementation Plan */}
              {activeTask.implementation_plan && (
                <div className="space-y-2 border-b border-border pb-6">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1 border-b border-border/40 pb-1.5 select-none">
                    <FileText className="h-4 w-4 text-primary" /> 1. Developer Implementation Plan
                  </label>
                  <div className="prose dark:prose-invert max-w-none prose-sm leading-relaxed">
                    <MarkdownMessage content={activeTask.implementation_plan} />
                  </div>
                </div>
              )}

              {/* 2. Proposed Changes & Code Diffs */}
              {activeTask.status !== "plan_generated" && (
                <div className="space-y-6 border-b border-border pb-6">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1 border-b border-border/40 pb-1.5 select-none">
                    <FileCode className="h-4 w-4 text-primary" /> 2. Proposed Code & Test Modifications
                  </label>
                  
                  {/* Proposed modified source files */}
                  <div className="space-y-4">
                    <h5 className="text-xs font-bold text-foreground/80 select-none">Modified Project Files</h5>
                    {Object.keys(proposedChangesMap).map((filePath) => (
                      <div key={filePath} className="border border-border rounded-lg overflow-hidden">
                        <div className="bg-muted/15 px-3 py-1.5 text-[11px] font-mono text-muted-foreground border-b border-border select-none">
                          📝 {filePath}
                        </div>
                        <pre className="p-3 bg-zinc-950/70 text-zinc-300 font-mono text-[10px] leading-relaxed overflow-x-auto whitespace-pre max-h-[300px]">
                          <code>{proposedChangesMap[filePath]}</code>
                        </pre>
                      </div>
                    ))}

                    {/* Proposed generated tests */}
                    <h5 className="text-xs font-bold text-foreground/80 select-none mt-6">Generated Unit Test Suites</h5>
                    {Object.keys(proposedTestsMap).map((filePath) => (
                      <div key={filePath} className="border border-border rounded-lg overflow-hidden">
                        <div className="bg-muted/15 px-3 py-1.5 text-[11px] font-mono text-muted-foreground border-b border-border select-none">
                          🧪 {filePath}
                        </div>
                        <pre className="p-3 bg-zinc-950/70 text-zinc-300 font-mono text-[10px] leading-relaxed overflow-x-auto whitespace-pre max-h-[300px]">
                          <code>{proposedTestsMap[filePath]}</code>
                        </pre>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 3. Pull Request Summary */}
              {activeTask.pr_summary && (
                <div className="space-y-2 pb-6">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1 border-b border-border/40 pb-1.5 select-none">
                    <GitPullRequest className="h-4 w-4 text-primary" /> 3. Compiled Pull Request Description
                  </label>
                  <div className="prose dark:prose-invert max-w-none prose-sm leading-relaxed">
                    <MarkdownMessage content={activeTask.pr_summary} />
                  </div>
                </div>
              )}

            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 select-none">
            <Sparkles className="h-10 w-10 text-primary/40 mb-3 stroke-[1.2]" />
            <h5 className="font-semibold text-sm text-foreground/90">Agent Task Environment</h5>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">
              Enter or paste a GitHub Issue description in the left panel. The AI developer agent will read the repository context, compile an implementation plan, draft code diffs, write unit tests, and prepare a PR summary for your approval.
            </p>
          </div>
        )}
      </div>

    </div>
  );
}
