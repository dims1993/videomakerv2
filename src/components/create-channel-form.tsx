"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { createChannelAction } from "@/app/channel-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { slugifyChannelKey } from "@/lib/channel-key";

type PipelineMode = "full" | "audio_only";

export function CreateChannelForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [keyTouched, setKeyTouched] = useState(false);
  const [key, setKey] = useState("");
  const [description, setDescription] = useState("");
  const [pipelineMode, setPipelineMode] = useState<PipelineMode>("full");
  const [audience, setAudience] = useState("");
  const [niche, setNiche] = useState("");
  const [categoryLabel, setCategoryLabel] = useState("");

  const suggestedKey = useMemo(() => slugifyChannelKey(name), [name]);
  const effectiveKey = keyTouched ? key : suggestedKey;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData(event.currentTarget);
    formData.set("key", effectiveKey);

    startTransition(async () => {
      try {
        const result = await createChannelAction(formData);
        router.push(`/videos/new?channelKey=${encodeURIComponent(result.key)}`);
        router.refresh();
      } catch (submitError) {
        setError(
          submitError instanceof Error
            ? submitError.message
            : "Could not create channel.",
        );
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="channel-name">Channel name</Label>
          <Input
            id="channel-name"
            name="name"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="My New Channel"
          />
        </div>

        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="channel-key">Channel key</Label>
          <Input
            id="channel-key"
            name="key"
            required
            value={effectiveKey}
            onChange={(event) => {
              setKeyTouched(true);
              setKey(event.target.value);
            }}
            placeholder="my-new-channel"
          />
          <p className="text-xs text-muted-foreground">
            Used in file paths and video records. Lowercase letters, numbers, and
            hyphens only.
          </p>
        </div>

        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="channel-description">Description</Label>
          <Textarea
            id="channel-description"
            name="description"
            required
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="What this channel teaches and who it is for."
            className="min-h-24"
          />
        </div>
      </div>

      <fieldset className="space-y-3 rounded-md border p-4">
        <legend className="px-1 text-sm font-medium">Pipeline mode</legend>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="radio"
            name="pipelineMode"
            value="full"
            checked={pipelineMode === "full"}
            onChange={() => setPipelineMode("full")}
            className="mt-1"
          />
          <span>
            <span className="font-medium">Full production</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              Topic queue → script → visual plan → assets → voiceover → render.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="radio"
            name="pipelineMode"
            value="audio_only"
            checked={pipelineMode === "audio_only"}
            onChange={() => setPipelineMode("audio_only")}
            className="mt-1"
          />
          <span>
            <span className="font-medium">Script / audio first</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              Create videos from title + topic and start on the Script tab
              (podcast-style).
            </span>
          </span>
        </label>
      </fieldset>

      {pipelineMode === "full" ? (
        <div className="grid gap-4 rounded-md border bg-muted/20 p-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="channel-audience">Audience</Label>
            <Input
              id="channel-audience"
              name="audience"
              required
              value={audience}
              onChange={(event) => setAudience(event.target.value)}
              placeholder="United States adults"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="channel-niche">Niche</Label>
            <Input
              id="channel-niche"
              name="niche"
              required
              value={niche}
              onChange={(event) => setNiche(event.target.value)}
              placeholder="personal productivity"
            />
          </div>
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="channel-category">Primary topic category</Label>
            <Input
              id="channel-category"
              name="categoryLabel"
              value={categoryLabel}
              onChange={(event) => setCategoryLabel(event.target.value)}
              placeholder="Defaults to niche if empty"
            />
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Creates starter prompt + bible files under{" "}
          <code className="text-[11px]">prompts/channels/</code> and{" "}
          <code className="text-[11px]">docs/channels/</code>, then opens Create
          video with this channel selected.
        </p>
      )}

      <Button type="submit" disabled={isPending}>
        {isPending ? "Creating…" : "Create channel"}
      </Button>
    </form>
  );
}
