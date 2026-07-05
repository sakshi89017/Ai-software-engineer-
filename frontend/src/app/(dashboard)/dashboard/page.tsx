"use client";

import * as React from "react";
import { useState, useEffect } from "react";
import {
  MessageSquare,
  FolderUp,
  Sparkles,
  Loader2,
  FileCode2,
  Bookmark,
  ShieldCheck,
  Activity,
  AlertTriangle,
  FolderDot
} from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";
import { useAuth } from "@/context/auth-context";
import { cn } from "@/lib/utils";

interface WeeklyActivityItem {
  day: string;
  chats: number;
  uploads: number;
  reviews: number;
  total: number;
}

interface LanguageUsageItem {
  language: string;
  count: number;
}

interface AnalyticsData {
  projects: number;
  repositories: number;
  uploaded_files: number;
  ai_chats: number;
  code_reviews: number;
  docs_generated: number;
  tests_generated: number;
  weekly_activity: WeeklyActivityItem[];
  language_usage: LanguageUsageItem[];
  technical_debt: number;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    apiClient
      .get<AnalyticsData>("/api/dashboard/analytics")
      .then(({ data }) => {
        setData(data);
      })
      .catch(() => {
        toast.error("Could not load dashboard statistics.");
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  if (isLoading || !data) {
    return (
      <div className="flex h-[70vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  // Calculate percentages for languages
  const totalLangCount = data.language_usage.reduce((sum, item) => sum + item.count, 0);

  return (
    <div className="space-y-6 select-none animate-in fade-in duration-300">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">Welcome Back</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Overview for signed-in session: <span className="font-semibold text-foreground/80">{user?.email}</span>
          </p>
        </div>
        <div className="flex items-center gap-1.5 bg-primary/10 border border-primary/20 text-primary px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0">
          <Sparkles className="h-4 w-4 animate-pulse" />
          <span>AI Engine Connected</span>
        </div>
      </div>

      {/* Grid: 4 Core Live Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        
        {/* Projects / Repositories */}
        <div className="bg-card border border-border p-4 rounded-xl flex items-start gap-4 hover:border-primary/20 transition-all shadow-sm">
          <div className="bg-blue-500/10 p-2.5 rounded-lg text-blue-500">
            <FolderDot className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Workspace Repositories</p>
            <h4 className="text-2xl font-bold mt-1 text-foreground">{data.projects}</h4>
            <p className="text-[9px] text-muted-foreground mt-1">
              Active projects: <span className="font-semibold">{data.projects}</span>
            </p>
          </div>
        </div>

        {/* Uploaded Files */}
        <div className="bg-card border border-border p-4 rounded-xl flex items-start gap-4 hover:border-primary/20 transition-all shadow-sm">
          <div className="bg-amber-500/10 p-2.5 rounded-lg text-amber-500">
            <FolderUp className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Uploaded Files</p>
            <h4 className="text-2xl font-bold mt-1 text-foreground">{data.uploaded_files}</h4>
            <p className="text-[9px] text-muted-foreground mt-1">
              Total files analyzed: <span className="font-semibold">{data.uploaded_files}</span>
            </p>
          </div>
        </div>

        {/* AI Chats */}
        <div className="bg-card border border-border p-4 rounded-xl flex items-start gap-4 hover:border-primary/20 transition-all shadow-sm">
          <div className="bg-emerald-500/10 p-2.5 rounded-lg text-emerald-500">
            <MessageSquare className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">AI Chat Threads</p>
            <h4 className="text-2xl font-bold mt-1 text-foreground">{data.ai_chats}</h4>
            <p className="text-[9px] text-muted-foreground mt-1">
              Q&A conversations: <span className="font-semibold">{data.ai_chats}</span>
            </p>
          </div>
        </div>

        {/* Core Review Reports */}
        <div className="bg-card border border-border p-4 rounded-xl flex items-start gap-4 hover:border-primary/20 transition-all shadow-sm">
          <div className="bg-purple-500/10 p-2.5 rounded-lg text-purple-500">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Code Reviews</p>
            <h4 className="text-2xl font-bold mt-1 text-foreground">{data.code_reviews}</h4>
            <p className="text-[9px] text-muted-foreground mt-1">
              AI reviews performed: <span className="font-semibold">{data.code_reviews}</span>
            </p>
          </div>
        </div>

      </div>

      {/* Grid: Secondary Module Stats */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Documentation Generated */}
        <div className="bg-card border border-border p-4 rounded-xl flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-500/10 p-2 rounded-lg text-indigo-500">
              <Bookmark className="h-4.5 w-4.5" />
            </div>
            <div>
              <h5 className="text-xs font-semibold text-foreground/90">Documentation Compiled</h5>
              <p className="text-[10px] text-muted-foreground mt-0.5">READMEs, APIs, and schemas generated</p>
            </div>
          </div>
          <span className="text-sm font-bold bg-muted p-1 px-3 rounded-md text-foreground">{data.docs_generated} docs</span>
        </div>

        {/* Tests Generated */}
        <div className="bg-card border border-border p-4 rounded-xl flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <div className="bg-pink-500/10 p-2 rounded-lg text-pink-500">
              <FileCode2 className="h-4.5 w-4.5" />
            </div>
            <div>
              <h5 className="text-xs font-semibold text-foreground/90">Test Suites Indexed</h5>
              <p className="text-[10px] text-muted-foreground mt-0.5">Unit, integration, and edge cases</p>
            </div>
          </div>
          <span className="text-sm font-bold bg-muted p-1 px-3 rounded-md text-foreground">{data.tests_generated} test files</span>
        </div>
      </div>

      {/* Split Details Layout */}
      <div className="grid gap-6 md:grid-cols-3">
        
        {/* Weekly Activity (Col 1 & 2) */}
        <div className="bg-card border border-border p-5 rounded-xl md:col-span-2 space-y-4 shadow-sm">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            <h4 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">Weekly Operation Activities</h4>
          </div>

          <div className="flex items-end justify-between h-40 pt-4 gap-2 border-b border-border/75">
            {data.weekly_activity.map((act) => {
              const maxVal = Math.max(...data.weekly_activity.map((a) => a.total), 1);
              const pct = Math.max(10, Math.min(100, (act.total / maxVal) * 100));
              return (
                <div key={act.day} className="flex-1 flex flex-col items-center gap-2 group">
                  <div className="w-full bg-muted/40 rounded-t-md relative flex flex-col justify-end h-32 overflow-hidden">
                    <div 
                      style={{ height: `${pct}%` }} 
                      className="bg-primary/20 hover:bg-primary/30 transition-all rounded-t-md relative flex flex-col justify-end items-center"
                    >
                      <span className="opacity-0 group-hover:opacity-100 transition-opacity absolute bottom-full bg-zinc-950 text-white text-[9px] px-1 rounded font-bold mb-1 shadow z-10 select-none pointer-events-none">
                        {act.total}
                      </span>
                    </div>
                  </div>
                  <span className="text-[10px] font-semibold text-muted-foreground">{act.day}</span>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between text-[9px] text-muted-foreground">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-primary/20 inline-block"></span> Operations Count</span>
            </div>
            <span>Calculated from live chats, uploads, and reviews</span>
          </div>
        </div>

        {/* Technical Debt & Languages (Col 3) */}
        <div className="space-y-6 md:col-span-1">
          
          {/* Technical Debt Gauge Card */}
          <div className="bg-card border border-border p-5 rounded-xl space-y-3.5 shadow-sm">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <h4 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">Technical Debt Index</h4>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-3xl font-black text-foreground">{data.technical_debt}%</h4>
                <p className="text-[9px] text-muted-foreground mt-0.5 max-w-[150px]">
                  Relative index computed from code reviews.
                </p>
              </div>
              <div className="h-14 w-14 rounded-full border-4 border-muted flex items-center justify-center relative overflow-hidden">
                <div 
                  className={cn(
                    "absolute inset-0 transition-all",
                    data.technical_debt > 25 ? "bg-red-500/10" : data.technical_debt > 10 ? "bg-amber-500/10" : "bg-emerald-500/10"
                  )}
                />
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">
                  {data.technical_debt > 25 ? "High" : data.technical_debt > 10 ? "Med" : "Low"}
                </span>
              </div>
            </div>
          </div>

          {/* Languages breakdown */}
          <div className="bg-card border border-border p-5 rounded-xl space-y-3.5 shadow-sm">
            <h4 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">Languages Usage</h4>
            
            {data.language_usage.length === 0 ? (
              <p className="text-[10px] text-muted-foreground italic text-center py-4">No code indexed yet.</p>
            ) : (
              <div className="space-y-2.5">
                {data.language_usage.map((lang) => {
                  const pct = totalLangCount > 0 ? Math.round((lang.count / totalLangCount) * 100) : 0;
                  return (
                    <div key={lang.language} className="space-y-1">
                      <div className="flex items-center justify-between text-[10px] font-medium text-foreground/80">
                        <span>{lang.language}</span>
                        <span>{lang.count} files ({pct}%)</span>
                      </div>
                      <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                        <div style={{ width: `${pct}%` }} className="h-full bg-primary/45 rounded-full" />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>

      </div>

    </div>
  );
}
