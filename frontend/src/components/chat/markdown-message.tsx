"use client";

import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CodeBlock } from "@/components/chat/code-block";

interface MarkdownMessageProps {
  content: string;
}

export function MarkdownMessage({ content }: MarkdownMessageProps) {
  return (
    <div className="prose prose-sm max-w-none dark:prose-invert prose-p:leading-relaxed prose-pre:p-0 prose-pre:bg-transparent">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || "");
            const isInline = !className;
            const codeString = String(children).replace(/\n$/, "");

            if (isInline) {
              return (
                <code className="rounded bg-muted px-1.5 py-0.5 text-[0.85em]" {...props}>
                  {children}
                </code>
              );
            }

            return <CodeBlock language={match?.[1] || ""} code={codeString} />;
          },
          table({ children }) {
            return (
              <div className="my-3 overflow-x-auto">
                <table className="w-full border-collapse text-sm">{children}</table>
              </div>
            );
          },
          th({ children }) {
            return <th className="border border-border bg-muted px-3 py-1.5 text-left">{children}</th>;
          },
          td({ children }) {
            return <td className="border border-border px-3 py-1.5">{children}</td>;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
