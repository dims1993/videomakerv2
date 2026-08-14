"use client";

import { useEffect, useState, type ChangeEvent } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ImageOutputFolderFieldProps = {
  id?: string;
  name?: string;
  label?: string;
  description?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
};

/**
 * Folder path for attach source + Flow output.
 * Browser directory pick cannot expose the real absolute path — only the
 * folder name — so "Use name" fills storage/generated-images/<name>. For any
 * other location, paste the full path (e.g. /Users/.../my-images).
 */
export function ImageOutputFolderField({
  id = "imageOutputFolder",
  name = "imageOutputFolder",
  label = "Image folder (attach source)",
  description,
  value,
  onChange,
  disabled = false,
}: ImageOutputFolderFieldProps) {
  const [pickerId] = useState(() => `${id}-picker`);

  function chooseFolder(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] as
      | (File & { webkitRelativePath?: string })
      | undefined;
    const rootFolder = file?.webkitRelativePath?.split("/")[0];
    if (rootFolder) {
      // Browser security: we only get the folder name, not the absolute path.
      // Prefer the podcast image-library convention (where episode stills live);
      // attach also falls back server-side if this path is empty.
      onChange(
        `data/image-library/podcast-english-lessons/${rootFolder}`,
      );
    }
    event.target.value = "";
  }

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      {description ? (
        <p className="text-xs text-muted-foreground">{description}</p>
      ) : null}
      <div className="flex gap-2">
        <Input
          id={id}
          name={name}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          placeholder="/Users/…/my-images or storage/generated-images/…"
        />
        <label
          htmlFor={pickerId}
          className={`inline-flex h-9 shrink-0 cursor-pointer items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground ${
            disabled ? "pointer-events-none opacity-50" : ""
          }`}
        >
          Use name
        </label>
        <input
          id={pickerId}
          type="file"
          className="sr-only"
          disabled={disabled}
          // @ts-expect-error non-standard directory picker attributes
          webkitdirectory=""
          directory=""
          onChange={chooseFolder}
        />
      </div>
    </div>
  );
}

type SyncedImageOutputFolderFieldProps = Omit<
  ImageOutputFolderFieldProps,
  "value" | "onChange"
> & {
  initialValue: string;
  onValueChange?: (value: string) => void;
};

/** Controlled wrapper that resets when the server default changes. */
export function SyncedImageOutputFolderField({
  initialValue,
  onValueChange,
  ...rest
}: SyncedImageOutputFolderFieldProps) {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  return (
    <ImageOutputFolderField
      {...rest}
      value={value}
      onChange={(next) => {
        setValue(next);
        onValueChange?.(next);
      }}
    />
  );
}
