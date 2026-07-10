"use client";

import { Copy } from "lucide-react";

import { Button } from "@/components/ui/button";

type CopySubtitleButtonProps = {
  label: string;
  text: string;
};

export function CopySubtitleButton({ label, text }: CopySubtitleButtonProps) {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={() => navigator.clipboard.writeText(text)}
      disabled={!text.trim()}
    >
      <Copy />
      {label}
    </Button>
  );
}
