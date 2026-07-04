import type { LucideIcon } from "lucide-react";
import { BookOpenText, Bug, Sparkles, Gauge, MessageSquareCode, Binary } from "lucide-react";

/**
 * Explicit AI action shortcuts (Step 5, Part A).
 *
 * These are pure client-side prompt templates — clicking a chip sends a
 * normal chat message (with the attached file_id) through the existing
 * POST /api/chat/message endpoint. The backend has no notion of "actions";
 * it just sees a regular user message, so streaming, persistence, title
 * generation, and error handling are all reused as-is with zero duplication.
 *
 * Kept here (rather than in ai/prompts.py) because the backend never needs
 * to know these templates exist — it only ever sees the resulting text.
 */
export interface AiAction {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Builds the templated message sent as the user's chat content. */
  buildPrompt: (fileName: string) => string;
}

export const AI_ACTIONS: AiAction[] = [
  {
    id: "explain",
    label: "Explain Code",
    icon: BookOpenText,
    buildPrompt: (fileName) =>
      `Explain what \`${fileName}\` does in detail, including its overall purpose, inputs/outputs, and any non-obvious logic.`,
  },
  {
    id: "find-bugs",
    label: "Find Bugs",
    icon: Bug,
    buildPrompt: (fileName) =>
      `Find bugs in \`${fileName}\` and explain the root cause of each.`,
  },
  {
    id: "suggest-improvements",
    label: "Suggest Improvements",
    icon: Sparkles,
    buildPrompt: (fileName) =>
      `Suggest improvements to \`${fileName}\`, covering readability, structure, and best practices.`,
  },
  {
    id: "optimize",
    label: "Optimize Code",
    icon: Gauge,
    buildPrompt: (fileName) =>
      `Optimize \`${fileName}\` for performance and explain what you changed and why.`,
  },
  {
    id: "generate-comments",
    label: "Generate Comments",
    icon: MessageSquareCode,
    buildPrompt: (fileName) =>
      `Add clear, concise comments to \`${fileName}\` explaining what each significant part does, and return the fully commented version.`,
  },
  {
    id: "explain-algorithm",
    label: "Explain This Algorithm",
    icon: Binary,
    buildPrompt: (fileName) =>
      `Explain the algorithm implemented in \`${fileName}\` step by step, including its time and space complexity.`,
  },
];
