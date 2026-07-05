"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { ChatView } from "@/components/chat/chat-view";

export default function NewChatPage() {
  const searchParams = useSearchParams();
  const fileId = searchParams.get("fileId");
  const fileName = searchParams.get("fileName");
  const projectId = searchParams.get("projectId");
  const projectName = searchParams.get("projectName");
  const debugPrompt = searchParams.get("debugPrompt");

  // key="new" ensures React remounts the view (and useChat's state) if the
  // user navigates back here after an existing chat, rather than reusing
  // stale streaming state.
  return (
    <ChatView
      key="new"
      chatId={null}
      initialAttachedFile={fileId && fileName ? { id: fileId, name: fileName } : null}
      initialAttachedProject={projectId && projectName ? { id: projectId, name: projectName } : null}
      initialDebugPrompt={debugPrompt}
    />
  );
}
