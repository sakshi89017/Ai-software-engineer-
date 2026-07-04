"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { ChatView } from "@/components/chat/chat-view";

export default function ExistingChatPage() {
  const params = useParams<{ id: string }>();
  return <ChatView key={params.id} chatId={params.id} />;
}
