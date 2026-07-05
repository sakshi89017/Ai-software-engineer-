"use client";

import * as React from "react";
import { useState } from "react";
import {
  Loader2,
  Sparkles,
  Download,
  Copy,
  Check,
  X,
  FileCode2
} from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTheme } from "next-themes";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark, oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";

interface TestGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileId: string;
  filename: string;
  language: string;
  sourceType: "project" | "upload";
}

const TEST_TYPES = [
  { id: "unit", label: "Unit Tests" },
  { id: "integration", label: "Integration Tests" },
  { id: "mock_data", label: "Mock Data / Fixtures" },
  { id: "edge_cases", label: "Edge Cases Tests" }
];

const LANGUAGES = [
  { id: "python", label: "Python (pytest / unittest)" },
  { id: "javascript", label: "JavaScript (Jest / Mocha)" },
  { id: "typescript", label: "TypeScript (Jest / Vitest)" },
  { id: "java", label: "Java (JUnit / TestNG)" },
  { id: "go", label: "Go (testing package)" }
];

export function TestGeneratorModal({
  isOpen,
  onClose,
  fileId,
  filename,
  language,
  sourceType
}: TestGeneratorModalProps) {
  const { theme } = useTheme();
  const [testType, setTestType] = useState<string>("unit");
  const [selectedLanguage, setSelectedLanguage] = useState<string>(() => {
    const lang = language.toLowerCase();
    if (lang === "py" || lang === "python") return "python";
    if (lang === "js" || lang === "javascript") return "javascript";
    if (lang === "ts" || lang === "typescript" || lang === "tsx" || lang === "jsx") return "typescript";
    if (lang === "java") return "java";
    if (lang === "go" || lang === "golang") return "go";
    return "python";
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedFilename, setGeneratedFilename] = useState<string | null>(null);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleGenerate = async () => {
    setIsGenerating(true);
    toast.info("Generating test suite with Gemini AI. Please wait...");
    try {
      const endpoint =
        sourceType === "project"
          ? `/api/projects/files/${fileId}/generate-tests`
          : `/api/uploads/${fileId}/generate-tests`;
      
      const { data } = await apiClient.post<{ filename: string; test_code: string }>(endpoint, {
        test_type: testType,
      });

      setGeneratedFilename(data.filename);
      setGeneratedCode(data.test_code);
      toast.success("Test suite compiled successfully!");
    } catch {
      toast.error("Generation failed. Please verify API configuration keys.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!generatedCode) return;
    try {
      await navigator.clipboard.writeText(generatedCode);
      setCopied(true);
      toast.success("Code copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy code.");
    }
  };

  const handleDownload = () => {
    if (!generatedFilename || !generatedCode) return;
    try {
      const blob = new Blob([generatedCode], { type: "text/plain;charset=utf-8" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", generatedFilename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Test file downloaded successfully!");
    } catch {
      toast.error("Could not download file.");
    }
  };

  const handleReset = () => {
    setGeneratedCode(null);
    setGeneratedFilename(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 select-none">
      <div className="w-full max-w-2xl rounded-xl border border-border bg-card shadow-2xl overflow-hidden flex flex-col h-[75vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/10 shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary animate-pulse" />
            <h3 className="font-semibold text-sm">AI Test Suite Generator</h3>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 min-h-0 select-text">
          {isGenerating ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground select-none">
              <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
              <span className="text-xs font-semibold">Generating test suite using Gemini AI...</span>
              <span className="text-[10px] text-muted-foreground/60 mt-1.5">Analyzing logic branches and exception handling scopes.</span>
            </div>
          ) : generatedCode && generatedFilename ? (
            <div className="flex flex-col h-full gap-4">
              <div className="flex items-center justify-between border border-border bg-muted/5 p-2 px-3 rounded-lg shrink-0 select-none">
                <div className="flex items-center gap-2 text-xs font-semibold text-foreground/80">
                  <FileCode2 className="h-4 w-4 text-primary" />
                  <span>{generatedFilename}</span>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleCopy} className="h-7 text-[10px] gap-1.5">
                    {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                    {copied ? "Copied" : "Copy"}
                  </Button>
                  <Button variant="default" size="sm" onClick={handleDownload} className="h-7 text-[10px] gap-1.5">
                    <Download className="h-3.5 w-3.5" />
                    Download File
                  </Button>
                </div>
              </div>

              {/* Code Highlight Panel */}
              <div className="flex-1 rounded-lg overflow-hidden border border-border bg-code-bg text-xs min-h-0 select-text">
                <SyntaxHighlighter
                  language={selectedLanguage}
                  style={theme === "light" ? oneLight : oneDark}
                  customStyle={{
                    margin: 0,
                    padding: "16px",
                    height: "100%",
                    overflowY: "auto",
                    background: "transparent",
                    fontSize: "11px",
                    lineHeight: "1.6"
                  }}
                >
                  {generatedCode}
                </SyntaxHighlighter>
              </div>
            </div>
          ) : (
            <div className="space-y-5 select-none max-w-md mx-auto py-8">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground/80">Test Type</label>
                <div className="grid grid-cols-2 gap-2">
                  {TEST_TYPES.map((type) => (
                    <button
                      key={type.id}
                      onClick={() => setTestType(type.id)}
                      className={cn(
                        "p-2 px-3 text-xs border rounded-lg transition-all text-left font-medium",
                        testType === type.id
                          ? "border-primary bg-primary/5 text-primary"
                          : "border-border text-muted-foreground hover:bg-muted/10 hover:text-foreground"
                      )}
                    >
                      {type.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground/80">Target Language / Framework</label>
                <div className="flex flex-col gap-1.5">
                  {LANGUAGES.map((lang) => (
                    <button
                      key={lang.id}
                      onClick={() => setSelectedLanguage(lang.id)}
                      className={cn(
                        "p-2.5 px-3.5 text-xs border rounded-lg transition-all text-left font-medium flex items-center justify-between",
                        selectedLanguage === lang.id
                          ? "border-primary bg-primary/5 text-primary"
                          : "border-border text-muted-foreground hover:bg-muted/10 hover:text-foreground"
                      )}
                    >
                      <span>{lang.label}</span>
                      {selectedLanguage === lang.id && (
                        <span className="bg-primary/20 text-primary text-[8px] px-1 rounded uppercase font-bold tracking-wider">Active</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border bg-muted/10 flex items-center justify-between shrink-0 select-none">
          {generatedCode ? (
            <Button variant="outline" size="sm" onClick={handleReset}>
              Configure Again
            </Button>
          ) : (
            <div className="text-[10px] text-muted-foreground">
              Target file: <span className="font-semibold text-foreground/70">{filename}</span>
            </div>
          )}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            {!generatedCode && (
              <Button variant="default" size="sm" onClick={handleGenerate} className="gap-1.5">
                <Sparkles className="h-3.5 w-3.5" />
                Generate Tests
              </Button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
