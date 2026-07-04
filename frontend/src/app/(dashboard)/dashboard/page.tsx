"use client";

import * as React from "react";
import { MessageSquare, FolderUp, History, Settings } from "lucide-react";
import { FeatureCard } from "@/components/dashboard/feature-card";
import { useAuth } from "@/context/auth-context";

export default function DashboardPage() {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Signed in as <span className="font-medium text-foreground">{user?.email}</span>
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <FeatureCard
          icon={MessageSquare}
          title="AI Chat"
          description="Ask questions, generate code, and get explanations from DevPilot AI."
          delay={0}
        />
        <FeatureCard
          icon={FolderUp}
          title="Uploads"
          description="Upload source files and let the AI analyze, debug, and improve them."
          delay={0.05}
        />
        <FeatureCard
          icon={History}
          title="History"
          description="Revisit past conversations and pick up right where you left off."
          delay={0.1}
        />
        <FeatureCard
          icon={Settings}
          title="Settings"
          description="Manage your profile, preferences, and account security."
          delay={0.15}
        />
      </div>
    </div>
  );
}
