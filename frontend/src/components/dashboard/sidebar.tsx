"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  LayoutDashboard, 
  MessageSquare, 
  FolderUp, 
  History, 
  Settings, 
  Sparkles, 
  Bug, 
  Users,
  ChevronDown,
  Database,
  User as UserIcon
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/auth-context";

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

const devItems = [
  { label: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { label: "AI Chat", href: "/dashboard/chat", icon: MessageSquare },
  { label: "Debug Assistant", href: "/dashboard/debug", icon: Bug },
  { label: "Uploads", href: "/dashboard/uploads", icon: FolderUp },
  { label: "Projects", href: "/dashboard/projects", icon: GithubIcon },
];

const teamItems = [
  { label: "Team Space", href: "/dashboard/teams", icon: Users },
];

const managementItems = [
  { label: "Activity History", href: "/dashboard/history", icon: History },
  { label: "Settings", href: "/dashboard/settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();

  const renderLink = (item: { label: string; href: string; icon: React.ComponentType<{ className?: string }> }) => {
    const isActive = pathname === item.href;
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        className={cn(
          "flex items-center gap-3 rounded-xl px-3 py-2 text-xs font-semibold transition-all duration-200 select-none",
          isActive
            ? "bg-primary text-primary-foreground shadow-md shadow-primary/10"
            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        )}
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span>{item.label}</span>
      </Link>
    );
  };

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-card/60 backdrop-blur-md md:flex h-full select-none">
      
      {/* Brand logo header */}
      <div className="flex h-16 items-center gap-2 border-b border-border px-6 shrink-0">
        <Sparkles className="h-5 w-5 text-primary" />
        <span className="text-sm font-black tracking-wider uppercase bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent">
          DevPilot AI
        </span>
      </div>

      {/* Workspace selector */}
      <div className="px-4 py-3 shrink-0">
        <div className="flex items-center justify-between rounded-xl border border-border bg-muted/20 p-2.5 hover:bg-muted/40 cursor-pointer">
          <div className="flex items-center gap-2">
            <span className="flex h-6.5 w-6.5 items-center justify-center rounded-lg bg-primary/10 text-[10px] font-bold text-primary">
              WS
            </span>
            <div className="flex flex-col text-left">
              <span className="text-[11px] font-bold">Main Workspace</span>
              <span className="text-[9px] text-muted-foreground">Default Workspace</span>
            </div>
          </div>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
      </div>

      {/* Scrollable Nav Item listings */}
      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-5">
        <div className="space-y-1">
          <div className="px-3 text-[9px] font-bold tracking-wider text-muted-foreground uppercase pb-1">AI Engineering</div>
          {devItems.map(renderLink)}
        </div>

        <div className="space-y-1">
          <div className="px-3 text-[9px] font-bold tracking-wider text-muted-foreground uppercase pb-1">Collaboration</div>
          {teamItems.map(renderLink)}
        </div>

        <div className="space-y-1">
          <div className="px-3 text-[9px] font-bold tracking-wider text-muted-foreground uppercase pb-1">Management</div>
          {managementItems.map(renderLink)}
        </div>
      </div>

      {/* Storage and utilization meters */}
      <div className="p-4 border-t border-border shrink-0 space-y-3 bg-muted/5">
        <div className="rounded-xl border border-border/60 bg-muted/10 p-3 space-y-2">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><Database className="h-3 w-3" /> Token Usage</span>
            <span className="font-semibold">68%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
            <div className="h-full rounded-full bg-primary" style={{ width: "68%" }} />
          </div>
          <span className="text-[9px] text-muted-foreground block text-center">68,230 of 100,000 monthly tokens</span>
        </div>

        {/* User Account avatar display card */}
        <div className="flex items-center gap-3 p-1.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary uppercase shrink-0">
            {user ? user.full_name.slice(0, 2) : <UserIcon className="h-4 w-4" />}
          </div>
          <div className="flex flex-col text-left overflow-hidden">
            <span className="text-[11px] font-bold truncate">{user?.full_name || "Guest Account"}</span>
            <span className="text-[9px] text-muted-foreground truncate">{user?.email || "guest@devpilot.ai"}</span>
          </div>
        </div>
      </div>

    </aside>
  );
}
