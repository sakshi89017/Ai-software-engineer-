import * as React from "react";
import { ChatSidebar } from "@/components/chat/chat-sidebar";

export default function ChatSectionLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="-m-6 flex h-[calc(100vh-4rem)]">
      <ChatSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">{children}</div>
    </div>
  );
}
