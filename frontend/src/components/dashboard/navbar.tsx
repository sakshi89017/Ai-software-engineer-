"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { 
  LogOut, 
  User as UserIcon, 
  Settings, 
  Menu, 
  X, 
  LayoutDashboard, 
  MessageSquare, 
  FolderUp, 
  History, 
  Bug, 
  Users 
} from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/context/auth-context";

function getInitials(name: string) {
  const parts = name.trim().split(" ");
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Navbar() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  return (
    <header className="relative flex h-16 items-center justify-between border-b border-border bg-card/50 px-6 backdrop-blur shrink-0 select-none">
      <div className="flex items-center gap-3">
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground md:hidden"
          aria-label="Toggle navigation menu"
        >
          {isMobileMenuOpen ? <X className="h-4.5 w-4.5" /> : <Menu className="h-4.5 w-4.5" />}
        </button>
        <div>
          <p className="text-sm text-muted-foreground hidden sm:block">
            Welcome back{user ? `, ${user.full_name.split(" ")[0]}` : ""} 👋
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <ThemeToggle />

        <DropdownMenu>
          <DropdownMenuTrigger className="outline-none">
            <Avatar>
              <AvatarFallback>{user ? getInitials(user.full_name) : "?"}</AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <p className="font-medium">{user?.full_name}</p>
              <p className="truncate text-xs font-normal text-muted-foreground">{user?.email}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push("/dashboard/settings")}>
              <UserIcon /> Profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push("/dashboard/settings")}>
              <Settings /> Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
              <LogOut /> Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {isMobileMenuOpen && (
        <div className="absolute left-0 right-0 top-16 border-b border-border bg-card/95 p-4 backdrop-blur shadow-lg z-50 flex flex-col gap-2 md:hidden">
          <Link
            href="/dashboard"
            onClick={() => setIsMobileMenuOpen(false)}
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <LayoutDashboard className="h-4 w-4" /> Overview
          </Link>
          <Link
            href="/dashboard/chat"
            onClick={() => setIsMobileMenuOpen(false)}
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <MessageSquare className="h-4 w-4" /> AI Chat
          </Link>
          <Link
            href="/dashboard/debug"
            onClick={() => setIsMobileMenuOpen(false)}
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <Bug className="h-4 w-4" /> Debug Assistant
          </Link>
          <Link
            href="/dashboard/teams"
            onClick={() => setIsMobileMenuOpen(false)}
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <Users className="h-4 w-4" /> Team Collaboration
          </Link>
          <Link
            href="/dashboard/uploads"
            onClick={() => setIsMobileMenuOpen(false)}
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <FolderUp className="h-4 w-4" /> Uploads
          </Link>
          <Link
            href="/dashboard/projects"
            onClick={() => setIsMobileMenuOpen(false)}
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <span className="h-4 w-4 flex items-center justify-center font-bold text-xs">🐙</span> Projects
          </Link>
          <Link
            href="/dashboard/history"
            onClick={() => setIsMobileMenuOpen(false)}
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <History className="h-4 w-4" /> History
          </Link>
          <Link
            href="/dashboard/settings"
            onClick={() => setIsMobileMenuOpen(false)}
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <Settings className="h-4 w-4" /> Settings
          </Link>
        </div>
      )}
    </header>
  );
}
