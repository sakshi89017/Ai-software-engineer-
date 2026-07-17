"use client";

import * as React from "react";
import { ChatSidebar } from "@/components/chat/chat-sidebar";
import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";

export default function ChatSectionLayout({ children }: { children: React.ReactNode }) {
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);

  return (
    <div className="-m-6 flex h-[calc(100vh-4rem)] relative overflow-hidden flex-col md:flex-row">
      {/* Sidebar Wrapper */}
      <div 
        className={`${
          isSidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        } fixed inset-y-16 left-0 z-40 w-72 bg-card border-r border-border transition-transform duration-300 ease-in-out md:static md:translate-x-0 md:flex flex-col shrink-0 h-[calc(100vh-4rem)]`}
      >
        <ChatSidebar />
      </div>
      
      {/* Backdrop overlay for mobile when sidebar is open */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-30 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Main Chat Area */}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        {/* Toggle Button for mobile */}
        <div className="flex items-center px-6 py-2.5 border-b border-border bg-card/40 md:hidden shrink-0">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="gap-2 text-xs"
          >
            <Menu className="h-4 w-4" />
            <span>Chat History</span>
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}
