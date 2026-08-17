"use client";

import { useMemo, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { createChannelAction } from "@/app/channel-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { slugifyChannelKey } from "@/lib/channel-key";

type PipelineMode = "full" | "audio_only";

function PackRow({
  title,
  source,
  purpose,
  children,
  suggested = true,
}: {
  title: string;
  source: string;
  purpose: string;
  children: ReactNode;
  suggested?: boolean;
}) {
  return (
    <div className="space-y-2 rounded-md border bg-background/80 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium">{title}</p>
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {suggested ? "Suggested" : "Optional"}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground/80">From:</span> {source}
        {" · "}
        <span className="font-medium text-foreground/80">For:</span> {purpose}
      </p>
      {children}
    </div>
  );
}

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
        const params = new URLSearchParams({
          channelKey: result.key,
        });
        if (result.maturePack.saved.length > 0) {
          params.set("packSaved", String(result.maturePack.saved.length));
        }
        router.push(`/videos/new?${params.toString()}`);
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
    <form onSubmit={onSubmit} className="space-y-6" encType="multipart/form-data">
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

      <fieldset className="space-y-4 rounded-md border border-dashed p-4">
        <legend className="px-1 text-sm font-medium">
          Mature channel pack
          <span className="ml-2 font-normal text-muted-foreground">
            (suggested — not required)
          </span>
        </legend>
        <p className="text-xs text-muted-foreground">
          Upload what you already have from reference videos and transcripts.
          Missing items stay as stubs you can fill later. Uploaded files replace
          the starter stubs and register assets for this channel.
        </p>

        <div className="space-y-3">
          <PackRow
            title="Project Bible"
            source="Editorial"
            purpose="Voz, misión, reglas"
          >
            <Input
              type="file"
              name="projectBibleFile"
              accept=".md,.txt,text/markdown,text/plain"
            />
          </PackRow>

          <PackRow
            title="Character Bible"
            source="Frames + brief"
            purpose="Identidad de hosts"
          >
            <Input
              type="file"
              name="characterBibleFile"
              accept=".md,.txt,text/markdown,text/plain"
            />
          </PackRow>

          <PackRow
            title="Image Prompt Bible"
            source="Frames + estilo"
            purpose="Locks visuales"
          >
            <Input
              type="file"
              name="imagePromptBibleFile"
              accept=".md,.txt,text/markdown,text/plain"
            />
          </PackRow>

          <PackRow
            title="Prompts (angle / script / visual / metadata)"
            source="Transcripts + estilo"
            purpose="Generación"
          >
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-1">
                <Label className="text-xs">Angle Builder</Label>
                <Input
                  type="file"
                  name="angleBuilderFile"
                  accept=".md,.txt,text/markdown,text/plain"
                />
              </div>
              <div className="grid gap-1">
                <Label className="text-xs">Script Writer</Label>
                <Input
                  type="file"
                  name="scriptWriterFile"
                  accept=".md,.txt,text/markdown,text/plain"
                />
              </div>
              <div className="grid gap-1">
                <Label className="text-xs">Visual Planner</Label>
                <Input
                  type="file"
                  name="visualPlannerFile"
                  accept=".md,.txt,text/markdown,text/plain"
                />
              </div>
              <div className="grid gap-1">
                <Label className="text-xs">Metadata Writer</Label>
                <Input
                  type="file"
                  name="metadataWriterFile"
                  accept=".md,.txt,text/markdown,text/plain"
                />
              </div>
            </div>
          </PackRow>

          <PackRow
            title="Transcripts de referencia"
            source="Competidores / propios"
            purpose="Script Writer (Reference Library)"
          >
            <div className="grid gap-2">
              <Input
                type="file"
                name="referenceTranscriptFiles"
                accept=".md,.txt,text/markdown,text/plain"
                multiple
              />
              <Input
                name="referenceTranscriptTitle"
                placeholder="Title for pasted / primary transcript"
              />
              <Textarea
                name="referenceTranscriptText"
                placeholder="Or paste one transcript here…"
                className="min-h-24"
              />
            </div>
          </PackRow>

          <PackRow
            title="Frames / stills de host"
            source="Video de referencia"
            purpose="Diseño humano (docs/.../references/)"
          >
            <Input
              type="file"
              name="hostReferenceImages"
              accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
              multiple
            />
          </PackRow>

          <PackRow
            title="Video-library bumpers"
            source="Clips prehechos"
            purpose="INTRO / LESSON / CLOSING / FINAL"
            suggested={pipelineMode === "audio_only"}
          >
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-1">
                <Label className="text-xs">INTRO</Label>
                <Input
                  type="file"
                  name="videoLibraryIntro"
                  accept="video/mp4,video/quicktime,.mp4,.mov,.webm,.m4v"
                />
              </div>
              <div className="grid gap-1">
                <Label className="text-xs">LESSON</Label>
                <Input
                  type="file"
                  name="videoLibraryLesson"
                  accept="video/mp4,video/quicktime,.mp4,.mov,.webm,.m4v"
                />
              </div>
              <div className="grid gap-1">
                <Label className="text-xs">CLOSING</Label>
                <Input
                  type="file"
                  name="videoLibraryClosing"
                  accept="video/mp4,video/quicktime,.mp4,.mov,.webm,.m4v"
                />
              </div>
              <div className="grid gap-1">
                <Label className="text-xs">FINAL</Label>
                <Input
                  type="file"
                  name="videoLibraryFinal"
                  accept="video/mp4,video/quicktime,.mp4,.mov,.webm,.m4v"
                />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Saved under{" "}
              <code className="text-[10px]">
                data/image-library/&#123;channelKey&#125;/video-library/
              </code>
              . Podcast attach still expects known filenames when wired.
            </p>
          </PackRow>

          <PackRow
            title="Editorial + topics brief"
            source="Brief"
            purpose="Topic Batch / estrategia"
            suggested={pipelineMode === "full"}
          >
            <Input
              type="file"
              name="editorialBriefFile"
              accept=".md,.txt,text/markdown,text/plain"
            />
            <Textarea
              name="editorialBriefText"
              placeholder="Or paste audience rules, overused angles, topic notes…"
              className="min-h-20"
            />
          </PackRow>
        </div>
      </fieldset>

      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Always creates starter files under{" "}
          <code className="text-[11px]">prompts/channels/</code> and{" "}
          <code className="text-[11px]">docs/channels/</code>. Uploads in the
          pack above replace stubs and register transcripts / references when
          provided.
        </p>
      )}

      <Button type="submit" disabled={isPending}>
        {isPending ? "Creating…" : "Create channel"}
      </Button>
    </form>
  );
}
