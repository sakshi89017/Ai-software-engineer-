"use client";

import * as React from "react";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  FolderOpen,
  Plus,
  Trash2,
  GitBranch,
  FileCode2,
  Sparkles,
  Search,
  Copy,
  Check,
  Calendar,
  User,
  ArrowLeft
} from "lucide-react";
import { toast } from "sonner";
import { projectService } from "@/services/project-service";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { extractApiErrorMessage } from "@/lib/api-client";
import type { Project, ProjectDetail, ProjectFileTreeItem } from "@/types/project";

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

// Tree node definition
interface TreeNode {
  name: string;
  path: string;
  id?: string;
  isFolder: boolean;
  children: TreeNode[];
}

// Tree builder helper
function buildTree(files: ProjectFileTreeItem[]): TreeNode[] {
  const root: TreeNode[] = [];

  for (const file of files) {
    const parts = file.file_path.split("/");
    let currentLevel = root;
    let accumulatedPath = "";

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      accumulatedPath = accumulatedPath ? `${accumulatedPath}/${part}` : part;
      const isLast = i === parts.length - 1;

      let existingNode = currentLevel.find((node) => node.name === part);

      if (!existingNode) {
        existingNode = {
          name: part,
          path: accumulatedPath,
          isFolder: !isLast,
          children: [],
          id: isLast ? file.id : undefined,
        };
        currentLevel.push(existingNode);

        // Sort folders above files, then alphabetically
        currentLevel.sort((a, b) => {
          if (a.isFolder && !b.isFolder) return -1;
          if (!a.isFolder && b.isFolder) return 1;
          return a.name.localeCompare(b.name);
        });
      }

      currentLevel = existingNode.children;
    }
  }

  return root;
}

// Recursive File Tree Component
interface FileTreeProps {
  nodes: TreeNode[];
  onFileSelect: (fileId: string) => void;
  selectedPath?: string;
}

function FileTree({ nodes, onFileSelect, selectedPath }: FileTreeProps) {
  const [expandedFolders, setExpandedFolders] = React.useState<Record<string, boolean>>({});

  const toggleFolder = (path: string) => {
    setExpandedFolders((prev) => ({ ...prev, [path]: !prev[path] }));
  };

  return (
    <ul className="space-y-1 pl-2 text-xs font-mono">
      {nodes.map((node) => {
        const isOpen = expandedFolders[node.path];
        const isSelected = selectedPath === node.path;

        if (node.isFolder) {
          return (
            <li key={node.path} className="space-y-0.5">
              <div
                onClick={() => toggleFolder(node.path)}
                className="flex items-center gap-1.5 py-1 px-1.5 rounded hover:bg-accent/40 cursor-pointer text-foreground/80 font-medium select-none"
              >
                <span className="text-[9px] w-2.5 text-muted-foreground">
                  {isOpen ? "▼" : "▶"}
                </span>
                <span className="text-yellow-500/80">📁</span>
                <span className="truncate">{node.name}</span>
              </div>
              {isOpen && (
                <div className="border-l border-border/40 ml-2.5 pl-1">
                  <FileTree nodes={node.children} onFileSelect={onFileSelect} selectedPath={selectedPath} />
                </div>
              )}
            </li>
          );
        } else {
          return (
            <li key={node.path}>
              <div
                onClick={() => node.id && onFileSelect(node.id)}
                className={cn(
                  "flex items-center gap-1.5 py-1 px-2 rounded hover:bg-accent/40 cursor-pointer pl-4.5 select-none",
                  isSelected ? "bg-primary/10 text-primary font-semibold" : "text-muted-foreground"
                )}
              >
                <span>📄</span>
                <span className="truncate">{node.name}</span>
              </div>
            </li>
          );
        }
      })}
    </ul>
  );
}

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [importUrl, setImportUrl] = useState("");
  const [isImporting, setIsImporting] = useState(false);

  // Selected project details
  const [selectedProject, setSelectedProject] = useState<ProjectDetail | Project | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);

  // File browser and code viewer states
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [activeFileContent, setActiveFileContent] = useState<string>("");
  const [activeFileName, setActiveFileName] = useState<string>("");
  const [activeFilePath, setActiveFilePath] = useState<string>("");
  const [isFileLoading, setIsFileLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedCode, setCopiedCode] = useState(false);

  // Load projects list
  const loadProjects = useCallback(async () => {
    setIsLoading(true);
    try {
      const list = await projectService.list();
      setProjects(list);
    } catch {
      toast.error("Could not fetch projects list.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // Polling hook for background tasks
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const checkStatus = async () => {
      if (!selectedProject) return;
      try {
        const detail = await projectService.getDetail(selectedProject.id);
        setSelectedProject(detail);
        if (detail.status === "completed" || detail.status === "failed") {
          if (intervalId) clearInterval(intervalId);
          // Reload list to update status column/cards
          const list = await projectService.list();
          setProjects(list);
          if (detail.status === "completed") {
            toast.success("Repository indexing successfully completed!");
          } else {
            toast.error(`Indexing failed: ${detail.error_message || "Unknown error"}`);
          }
        }
      } catch {
        if (intervalId) clearInterval(intervalId);
      }
    };

    if (
      selectedProject &&
      (selectedProject.status === "pending" ||
        selectedProject.status === "cloning" ||
        selectedProject.status === "indexing")
    ) {
      intervalId = setInterval(checkStatus, 2500);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [selectedProject]);

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importUrl.trim()) return;

    if (!importUrl.startsWith("https://github.com/") && !importUrl.startsWith("http://github.com/")) {
      toast.error("Please enter a valid public GitHub URL (https://github.com/owner/repo)");
      return;
    }

    setIsImporting(true);
    try {
      const project = await projectService.importGithub(importUrl.trim());
      setProjects((prev) => [project, ...prev]);
      setImportUrl("");
      setSelectedProject(project);
      toast.success("GitHub cloning queued in background!");
    } catch (err) {
      toast.error(extractApiErrorMessage(err));
    } finally {
      setIsImporting(false);
    }
  };

  const handleSelectProject = async (project: Project) => {
    setSelectedProject(project);
    setIsDetailLoading(true);
    setActiveFileId(null);
    setActiveFileContent("");
    setActiveFileName("");
    setActiveFilePath("");
    setSearchQuery("");
    try {
      const data = await projectService.getDetail(project.id);
      setSelectedProject(data);
    } catch {
      toast.error("Failed to load project details.");
    } finally {
      setIsDetailLoading(false);
    }
  };

  const handleSelectFile = async (fileId: string) => {
    setIsFileLoading(true);
    setActiveFileId(fileId);
    setSearchQuery("");
    try {
      const fileData = await projectService.getFile(fileId);
      setActiveFileContent(fileData.content);
      setActiveFileName(fileData.filename);
      setActiveFilePath(fileData.file_path);
    } catch {
      toast.error("Could not fetch file content.");
      setActiveFileId(null);
    } finally {
      setIsFileLoading(false);
    }
  };

  const handleDeleteProject = async (projectId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this project and all its files?")) return;

    try {
      await projectService.remove(projectId);
      setProjects((prev) => prev.filter((p) => p.id !== projectId));
      if (selectedProject?.id === projectId) {
        setSelectedProject(null);
      }
      toast.success("Project deleted successfully");
    } catch {
      toast.error("Could not delete project");
    }
  };

  const handleCopyCode = async () => {
    await navigator.clipboard.writeText(activeFileContent);
    setCopiedCode(true);
    toast.success("Code copied to clipboard!");
    setTimeout(() => setCopiedCode(false), 1500);
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
        <mark key={idx} className="bg-yellow-500/30 text-yellow-900 dark:text-yellow-100 px-0.5 rounded">
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "pending":
        return "Queueing...";
      case "cloning":
        return "Cloning Repository...";
      case "indexing":
        return "Indexing Codebase...";
      case "completed":
        return "Completed";
      case "failed":
        return "Failed";
      default:
        return status;
    }
  };

  const codeLines = activeFileContent.split("\n");
  const projectDetail = selectedProject as ProjectDetail;
  const projectTree = projectDetail && projectDetail.files ? buildTree(projectDetail.files) : [];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">GitHub Code Repositories</h1>
          <p className="text-muted-foreground">Import public repositories to browse codebase and ask AI questions.</p>
        </div>
        {selectedProject && (
          <Button variant="ghost" size="sm" onClick={() => setSelectedProject(null)} className="gap-1.5">
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Button>
        )}
      </div>

      {/* DASHBOARD VIEW: LIST & IMPORT BOX */}
      {!selectedProject ? (
        <div className="grid gap-6 md:grid-cols-3">
          
          {/* Import Panel */}
          <div className="md:col-span-1 space-y-4">
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
              <h2 className="text-sm font-semibold flex items-center gap-1.5">
                <GithubIcon className="h-4 w-4 text-primary" />
                Import public repository
              </h2>
              <form onSubmit={handleImport} className="space-y-3">
                <div className="space-y-1">
                  <input
                    type="url"
                    required
                    placeholder="https://github.com/owner/repo"
                    value={importUrl}
                    onChange={(e) => setImportUrl(e.target.value)}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>
                <Button type="submit" size="sm" className="w-full text-xs gap-1.5" disabled={isImporting}>
                  {isImporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  Cloning repository
                </Button>
              </form>
            </div>
          </div>

          {/* Projects List Panel */}
          <div className="md:col-span-2 space-y-4">
            <h2 className="text-sm font-semibold text-muted-foreground">Your Repositories</h2>
            {isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : projects.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-12 text-center text-muted-foreground bg-muted/5">
                <FolderOpen className="h-10 w-10 stroke-[1.2] mb-2" />
                <p className="text-sm">No project repositories imported yet.</p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {projects.map((project) => (
                  <div
                    key={project.id}
                    onClick={() => handleSelectProject(project)}
                    className="flex flex-col justify-between rounded-xl border border-border bg-card p-5 hover:border-primary/50 cursor-pointer shadow-sm hover:shadow transition-all group"
                  >
                    <div>
                      <div className="flex justify-between items-start gap-2">
                        <h3 className="font-semibold text-sm group-hover:text-primary transition-colors truncate">
                          {project.repo_name || "Repository"}
                        </h3>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 hover:bg-destructive/10 hover:text-destructive shrink-0"
                          onClick={(e) => handleDeleteProject(project.id, e)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-1">@{project.repo_owner || "Owner"}</p>
                    </div>

                    <div className="mt-5 space-y-2">
                      {/* Status indicator */}
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Status:</span>
                        <span
                          className={cn(
                            "font-semibold",
                            project.status === "completed" && "text-green-500",
                            project.status === "failed" && "text-destructive",
                            ["pending", "cloning", "indexing"].includes(project.status) && "text-primary"
                          )}
                        >
                          {project.status === "completed" ? "Completed" : getStatusLabel(project.status)}
                        </span>
                      </div>
                      
                      {/* Metric info */}
                      {project.status === "completed" && (
                        <div className="grid grid-cols-2 gap-1 text-[10px] text-muted-foreground border-t border-border/40 pt-2 mt-2">
                          <div>📄 {project.total_files} Files</div>
                          <div>📏 {project.total_lines.toLocaleString()} Lines</div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      ) : (
        /* PROJECT DETAIL WORKSPACE */
        <div className="space-y-6">
          {/* Project Details Banner */}
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <GithubIcon className="h-5 w-5 text-primary" />
                  {selectedProject.repo_owner}/{selectedProject.repo_name}
                </h2>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <GitBranch className="h-3.5 w-3.5" />
                    {selectedProject.default_branch || "main"}
                  </span>
                  <span>·</span>
                  <span className="bg-primary/10 text-primary px-2 py-0.5 rounded font-bold uppercase text-[10px]">
                    {selectedProject.framework || "Generic"}
                  </span>
                  <span>·</span>
                  <span>{formatBytes(selectedProject.size_bytes)}</span>
                  <span>·</span>
                  <span>{selectedProject.total_files} files</span>
                  <span>·</span>
                  <span>{selectedProject.total_lines.toLocaleString()} lines</span>
                </div>
              </div>

              {/* Status Header */}
              {["pending", "cloning", "indexing"].includes(selectedProject.status) && (
                <div className="flex items-center gap-3 bg-primary/5 border border-primary/20 px-4 py-2 rounded-lg">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span className="text-xs font-semibold text-primary">{getStatusLabel(selectedProject.status)}</span>
                </div>
              )}
            </div>

            {/* Commit and Languages info */}
            {selectedProject.status === "completed" && (
              <div className="grid md:grid-cols-2 gap-6 mt-6 pt-6 border-t border-border">
                {/* Languages */}
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Languages</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedProject.languages ? (
                      selectedProject.languages.split(",").map((l) => (
                        <span key={l} className="bg-secondary px-2.5 py-0.5 rounded text-[10px] uppercase font-bold text-foreground">
                          {l}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground">Unknown</span>
                    )}
                  </div>
                </div>

                {/* Last Commit */}
                {selectedProject.last_commit_sha && (
                  <div className="space-y-2 text-xs">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Last Commit</h3>
                    <div className="rounded bg-muted/30 border border-border/40 p-2.5 font-mono space-y-1">
                      <div className="flex items-center justify-between font-semibold">
                        <span className="truncate max-w-[70%] text-foreground">
                          {selectedProject.last_commit_message}
                        </span>
                        <span className="text-muted-foreground text-[10px]">
                          {selectedProject.last_commit_sha.slice(0, 7)}
                        </span>
                      </div>
                      <div className="flex items-center gap-x-2 mt-1 text-[10px] text-muted-foreground">
                        <span className="flex items-center gap-0.5">
                          <User className="h-3 w-3" />
                          {selectedProject.last_commit_author}
                        </span>
                        <span>·</span>
                        <span className="flex items-center gap-0.5">
                          <Calendar className="h-3 w-3" />
                          {selectedProject.last_commit_date ? formatDate(selectedProject.last_commit_date) : "N/A"}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* PROJECT WORKSPACE: SIDEBAR & CODE VIEWER */}
          {selectedProject.status === "completed" && (
            <div className="flex h-[60vh] gap-6 rounded-xl border border-border overflow-hidden bg-card">
              
              {/* Left Side: Folder Directory Tree */}
              <div className="w-80 border-r border-border flex flex-col min-h-0 bg-muted/5">
                <div className="p-4 border-b border-border bg-muted/15 flex items-center justify-between shrink-0">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Repository Files</h3>
                </div>
                
                <div className="flex-1 overflow-y-auto p-3">
                  {isDetailLoading ? (
                    <div className="flex items-center justify-center h-32">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : projectTree.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-8">No files found.</p>
                  ) : (
                    <FileTree
                      nodes={projectTree}
                      onFileSelect={handleSelectFile}
                      selectedPath={activeFilePath}
                    />
                  )}
                </div>
              </div>

              {/* Right Side: Code Viewer */}
              <div className="flex-1 flex flex-col overflow-hidden min-h-0">
                {activeFileId ? (
                  <div className="flex flex-1 flex-col overflow-hidden min-h-0">
                    
                    {/* Code Header */}
                    <div className="px-6 py-4 border-b border-border bg-muted/10 flex items-center justify-between shrink-0">
                      <div>
                        <h4 className="font-semibold text-sm truncate max-w-lg">{activeFileName}</h4>
                        <p className="text-[10px] text-muted-foreground mt-0.5 font-mono">{activeFilePath}</p>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {/* Search inside file */}
                        <div className="relative flex items-center max-w-xs">
                          <Search className="absolute left-2.5 h-3 w-3 text-muted-foreground" />
                          <input
                            type="text"
                            placeholder="Search code..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="h-8 pl-8 pr-3 rounded border border-input bg-background text-[11px] placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          />
                        </div>

                        <Button variant="outline" size="sm" className="h-8 gap-1" onClick={handleCopyCode}>
                          {copiedCode ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                          Copy
                        </Button>

                        <Button
                          variant="default"
                          size="sm"
                          className="h-8 gap-1"
                          onClick={() => {
                            router.push(`/dashboard/chat?fileId=${activeFileId}&fileName=${encodeURIComponent(activeFileName)}`);
                          }}
                        >
                          <Sparkles className="h-3.5 w-3.5" />
                          Ask AI
                        </Button>
                      </div>
                    </div>

                    {/* Code CodeBlock */}
                    <div className="flex-1 overflow-auto bg-muted/15 font-mono text-sm leading-relaxed flex min-h-0 select-text">
                      {isFileLoading ? (
                        <div className="flex-1 flex items-center justify-center">
                          <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        </div>
                      ) : (
                        <>
                          <div className="py-4 select-none bg-muted/40 border-r border-border text-right text-muted-foreground/60 min-w-[3.5rem] pr-3 text-xs leading-6">
                            {codeLines.map((_, i) => (
                              <div key={i}>{i + 1}</div>
                            ))}
                          </div>
                          <div className="py-4 pl-4 pr-6 overflow-x-auto w-full text-foreground/90 text-xs leading-6 whitespace-pre min-w-0">
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
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground/60 p-8 text-center">
                    <FileCode2 className="h-10 w-10 mb-2 stroke-[1.2]" />
                    <p className="text-sm">Select a file from the repository tree to preview its content.</p>
                  </div>
                )}
              </div>

            </div>
          )}
        </div>
      )}
    </div>
  );
}
