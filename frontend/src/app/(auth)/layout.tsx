import * as React from "react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-secondary/40 px-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 shadow-lg">
        <div className="mb-6 text-center">
          <div className="mb-2 text-2xl font-bold tracking-tight">The AI Software Engineer</div>
          <p className="text-sm text-muted-foreground">Your AI-powered software engineering assistant</p>
        </div>
        {children}
      </div>
    </div>
  );
}
