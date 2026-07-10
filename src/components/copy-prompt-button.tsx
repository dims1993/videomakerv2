"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export function CopyPromptButton({
  label,
  prompt,
  promptUrl,
}: {
  label: string;
  prompt?: string;
  promptUrl?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copyPrompt() {
    let text = prompt ?? "";

    if (!text && promptUrl) {
      const response = await fetch(promptUrl);

      if (!response.ok) {
        throw new Error("Could not load prompt.");
      }

      text = await response.text();
    }

    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <Button type="button" variant="outline" onClick={copyPrompt}>
      {copied ? <Check /> : <Copy />}
      {copied ? "Copied" : label}
    </Button>
  );
}
