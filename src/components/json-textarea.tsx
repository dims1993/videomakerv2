"use client";

import { useEffect, useRef, useState } from "react";
import type React from "react";

import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export function JsonTextarea({
  className,
  defaultValue = "",
  onChange,
  onBlur,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [error, setError] = useState("");

  function validate(value: string) {
    const trimmed = value.trim();

    if (!trimmed) {
      setError("");
      ref.current?.setCustomValidity("");
      return;
    }

    try {
      JSON.parse(trimmed);
      setError("");
      ref.current?.setCustomValidity("");
    } catch {
      const message = "Invalid JSON. Fix the syntax or leave the field empty.";
      setError(message);
      ref.current?.setCustomValidity(message);
    }
  }

  useEffect(() => {
    validate(defaultValue.toString());
  }, [defaultValue]);

  return (
    <div className="grid gap-2">
      <Textarea
        ref={ref}
        {...props}
        className={cn(
          error && "border-destructive focus-visible:ring-destructive",
          className,
        )}
        defaultValue={defaultValue}
        onChange={(event) => {
          validate(event.currentTarget.value);
          onChange?.(event);
        }}
        onBlur={(event) => {
          validate(event.currentTarget.value);
          onBlur?.(event);
        }}
      />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
