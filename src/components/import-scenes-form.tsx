"use client";

import type React from "react";
import { useActionState, useEffect, useMemo, useState } from "react";

import { CopyPromptButton } from "@/components/copy-prompt-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { JsonTextarea } from "@/components/json-textarea";
import type { ImportScenesState } from "@/lib/action-types";
import {
  extractScriptSegmentByPercent,
  parseScriptFromCurrentVideoData,
  parseAndValidateHandoffResponse,
  scenesToImportJson,
  validateSegmentPercentRange,
  type ChatGptGenerationMode,
  type SceneHandoffValidation,
} from "@/lib/chatgpt-scene-handoff";
import { getChannelSceneGenerationModes } from "@/lib/channels";
import { Textarea } from "@/components/ui/textarea";

const initialState: ImportScenesState = {
  status: "idle",
  message: "",
};

const GENERATION_MODE_LABELS: Record<ChatGptGenerationMode, string> = {
  FULL_VIDEO: "Full Video",
  TEN_SCENE_TEST: "10-Scene Test",
  HOOK_TEST: "Hook Test",
  SEGMENTED_BY_PERCENT: "Segmented by Percent",
};

type SceneImportMode = "replace" | "append";

function getSuggestedSceneImportMode({
  generationMode,
  startPercent,
}: {
  generationMode: ChatGptGenerationMode;
  startPercent: number;
}): SceneImportMode {
  if (generationMode === "SEGMENTED_BY_PERCENT" && startPercent > 0) {
    return "append";
  }

  return "replace";
}

function getDefaultGenerationMode(
  allowedModes: ChatGptGenerationMode[],
): ChatGptGenerationMode {
  if (allowedModes.includes("TEN_SCENE_TEST")) {
    return "TEN_SCENE_TEST";
  }

  return allowedModes.includes("FULL_VIDEO")
    ? "FULL_VIDEO"
    : allowedModes[0];
}

function resolveGenerationMode(
  mode: ChatGptGenerationMode,
  allowedModes: ChatGptGenerationMode[],
): ChatGptGenerationMode {
  if (allowedModes.includes(mode)) {
    return mode;
  }

  return allowedModes.includes("FULL_VIDEO")
    ? "FULL_VIDEO"
    : allowedModes[0];
}

export function ImportScenesForm({
  action,
  visualPlanPromptUrl,
  channelName,
  videoId,
  videoTitle,
  channelKey,
  projectBiblePath,
  imagePromptBiblePath,
  characterBiblePath,
  visualPlannerPath,
  scriptLength,
  currentSceneCount,
  currentScenesJson,
}: {
  action: (
    previousState: ImportScenesState,
    formData: FormData,
  ) => Promise<ImportScenesState>;
  visualPlanPromptUrl: string;
  channelName: string;
  videoId: string;
  videoTitle: string;
  channelKey: string;
  projectBiblePath: string;
  imagePromptBiblePath: string;
  characterBiblePath?: string;
  visualPlannerPath: string;
  scriptLength: number;
  currentSceneCount: number;
  currentScenesJson: string;
}) {
  const allowedModes = useMemo(
    () => getChannelSceneGenerationModes(channelKey),
    [channelKey],
  );
  const [state, formAction, isPending] = useActionState(action, initialState);
  const [mode, setMode] = useState<ChatGptGenerationMode>(() =>
    getDefaultGenerationMode(allowedModes),
  );
  const [startPercent, setStartPercent] = useState(0);
  const [endPercent, setEndPercent] = useState(10);
  const [importMode, setImportMode] = useState<SceneImportMode>("replace");
  const [importModeAutoSet, setImportModeAutoSet] = useState(false);
  const [request, setRequest] = useState("");
  const [requestError, setRequestError] = useState("");
  const [requestWarnings, setRequestWarnings] = useState<string[]>([]);
  const [response, setResponse] = useState("");
  const [validation, setValidation] = useState<SceneHandoffValidation | null>(
    null,
  );
  const [copied, setCopied] = useState(false);
  const segmentValidationError = useMemo(
    () => validateSegmentPercentRange(startPercent, endPercent),
    [startPercent, endPercent],
  );
  const parsedScenesJson = useMemo(
    () => (validation ? scenesToImportJson(validation.scenes) : ""),
    [validation],
  );

  useEffect(() => {
    setMode((currentMode) => resolveGenerationMode(currentMode, allowedModes));
  }, [allowedModes]);

  useEffect(() => {
    const suggestedImportMode = getSuggestedSceneImportMode({
      generationMode: mode,
      startPercent,
    });

    setImportMode(suggestedImportMode);
    setImportModeAutoSet(
      mode === "SEGMENTED_BY_PERCENT" && startPercent > 0,
    );
  }, [mode, startPercent]);

  async function generateRequest() {
    setRequestError("");
    setRequestWarnings([]);

    if (mode === "SEGMENTED_BY_PERCENT" && segmentValidationError) {
      setRequestError(segmentValidationError);
      return;
    }

    try {
      const promptResponse = await fetch(visualPlanPromptUrl);

      if (!promptResponse.ok) {
        throw new Error("Could not load the Visual Planner prompt.");
      }

      const fullPrompt = await promptResponse.text();
      const chatGptRequest = buildChatGptRequest({
        fullPrompt,
        mode,
        videoId,
        videoTitle,
        channelKey,
        projectBiblePath,
        imagePromptBiblePath,
        characterBiblePath,
        visualPlannerPath,
        scriptLength,
        segmentRange:
          mode === "SEGMENTED_BY_PERCENT"
            ? { startPercent, endPercent }
            : undefined,
      });

      setRequest(chatGptRequest.request);
      setRequestWarnings(chatGptRequest.warnings);
    } catch (error) {
      setRequestError(
        error instanceof Error
          ? error.message
          : "Could not generate ChatGPT request.",
      );
    }
  }

  async function copyRequest() {
    if (!request) {
      return;
    }

    await navigator.clipboard.writeText(request);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  function parseResponse() {
    try {
      setValidation(parseAndValidateHandoffResponse(response));
    } catch (error) {
      setValidation({
        scenes: [],
        errors: [
          error instanceof Error
            ? error.message
            : "Could not find a valid JSON array in the pasted response.",
        ],
        warnings: [],
        summary: {
          totalScenes: 0,
          avatarScenes: 0,
          insertScenes: 0,
          spaceScenes: 0,
          averageDuration: 0,
          totalDuration: 0,
          mainHostScenes: 0,
          supportingCharacterScenes: 0,
          insertTaggedScenes: 0,
          spaceTaggedScenes: 0,
          hookScenes: 0,
          bodyScenes: 0,
          otherSectionScenes: 0,
          sectionCounts: {},
        },
      });
    }
  }

  function confirmReplace() {
    if (importMode === "append") {
      return true;
    }

    return (
      currentSceneCount === 0 ||
      window.confirm(
        `This will replace ${currentSceneCount} existing scene(s). Continue?`,
      )
    );
  }

  function handleChatGptImportSubmit(event: React.FormEvent<HTMLFormElement>) {
    if (!confirmReplace()) {
      event.preventDefault();
    }
  }

  function handleManualImportSubmit(event: React.FormEvent<HTMLFormElement>) {
    if (!confirmReplace()) {
      event.preventDefault();
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-md border bg-muted/30 p-4">
        <div className="space-y-4">
          <div>
            <h3 className="text-base font-medium">ChatGPT Scene Generation</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Generate a complete request packet, paste it into ChatGPT, then
              paste the response here to validate and import.
            </p>
          </div>

          <div className="grid gap-3 lg:grid-cols-[220px_auto_auto_1fr]">
            <div className="grid gap-2">
              <Label htmlFor="generationMode">Generation mode</Label>
              <select
                id="generationMode"
                value={mode}
                onChange={(event) =>
                  setMode(event.target.value as ChatGptGenerationMode)
                }
                className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
              >
                {allowedModes.map((allowedMode) => (
                  <option key={allowedMode} value={allowedMode}>
                    {GENERATION_MODE_LABELS[allowedMode]}
                  </option>
                ))}
              </select>
            </div>
            <Button type="button" className="mt-7" onClick={generateRequest}>
              Generate ChatGPT Request
            </Button>
            <Button
              type="button"
              className="mt-7"
              variant="outline"
              disabled={!request}
              onClick={copyRequest}
            >
              {copied ? "Copied" : "Copy ChatGPT Request"}
            </Button>
          </div>

          {mode === "SEGMENTED_BY_PERCENT" ? (
            <div className="grid gap-3 rounded-md border bg-background p-3 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="segmentStartPercent">Start percent</Label>
                <Input
                  id="segmentStartPercent"
                  type="number"
                  min={0}
                  max={100}
                  value={startPercent}
                  onChange={(event) =>
                    setStartPercent(Number(event.target.value))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="segmentEndPercent">End percent</Label>
                <Input
                  id="segmentEndPercent"
                  type="number"
                  min={0}
                  max={100}
                  value={endPercent}
                  onChange={(event) => setEndPercent(Number(event.target.value))}
                />
              </div>
              {segmentValidationError ? (
                <p
                  className="text-sm text-destructive sm:col-span-2"
                  role="alert"
                >
                  {segmentValidationError}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground sm:col-span-2">
                  Generate scenes for approximately {startPercent}% to{" "}
                  {endPercent}% of the script.
                </p>
              )}
            </div>
          ) : null}

          {requestError ? (
            <p className="text-sm text-destructive" role="alert">
              {requestError}
            </p>
          ) : null}

          {requestWarnings.length > 0 ? (
            <ValidationList
              title="Context warning"
              items={requestWarnings}
              variant="warning"
            />
          ) : null}

          {request ? (
            <details className="rounded-md border bg-background p-3">
              <summary className="cursor-pointer text-sm font-medium">
                Preview generated request
              </summary>
              <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap text-xs">
                {request}
              </pre>
            </details>
          ) : null}

          <div className="grid gap-2">
            <Label htmlFor="chatGptResponse">ChatGPT Response</Label>
            <Textarea
              id="chatGptResponse"
              value={response}
              onChange={(event) => setResponse(event.target.value)}
              className="min-h-64 font-mono text-sm"
              placeholder="Paste ChatGPT's response here. Raw JSON, fenced JSON, or JSON surrounded by explanation text are supported."
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="sceneImportMode">Import mode</Label>
            <select
              id="sceneImportMode"
              value={importMode}
              onChange={(event) => {
                setImportMode(event.target.value as SceneImportMode);
                setImportModeAutoSet(false);
              }}
              className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
            >
              <option value="replace">Replace existing scenes</option>
              <option value="append">Append to existing scenes</option>
            </select>
            {importModeAutoSet ? (
              <p className="text-sm text-muted-foreground">
                Append was selected automatically because this is a later script
                segment. You can switch to Replace below if needed.
              </p>
            ) : null}
            {mode === "SEGMENTED_BY_PERCENT" &&
            importMode === "replace" &&
            startPercent > 0 ? (
              <p className="text-sm text-yellow-700 dark:text-yellow-300">
                You are importing a later segment with Replace selected. This
                will remove existing scenes.
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={parseResponse}>
              Parse & Validate Response
            </Button>
            <form action={formAction} onSubmit={handleChatGptImportSubmit}>
              <input type="hidden" name="scenesJson" value={parsedScenesJson} />
              <input type="hidden" name="importMode" value={importMode} />
              <Button
                type="submit"
                disabled={
                  isPending ||
                  !validation ||
                  validation.errors.length > 0 ||
                  validation.scenes.length === 0
                }
              >
                {isPending
                  ? "Importing..."
                  : importMode === "append"
                    ? "Append Parsed Scenes"
                    : "Replace Parsed Scenes"}
              </Button>
            </form>
          </div>

          {validation ? <HandoffPreview validation={validation} /> : null}
        </div>
      </div>

      <form
        action={formAction}
        className="space-y-4"
        onSubmit={handleManualImportSubmit}
      >
        <div className="grid gap-2">
          <Label htmlFor="scenesJson">Manual Scenes JSON</Label>
          <p className="text-sm text-muted-foreground">
            Paste the JSON array generated by the Visual Planner. This will
            replace the current scenes for this video.
          </p>
          <JsonTextarea
            id="scenesJson"
            name="scenesJson"
            className="min-h-80 font-mono text-sm"
            placeholder='[{"scriptText":"","sceneType":"avatar","visualPurpose":"","visualIdea":"","duration":8,"imagePrompt":"","status":"planned"}]'
            required
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <CopyPromptButton
            label={`Copy Visual Planner Prompt — ${channelName}`}
            promptUrl={visualPlanPromptUrl}
          />
          <CopyPromptButton
            label="Copy Current Scenes JSON"
            prompt={currentScenesJson}
          />
          <Button type="submit" variant="outline" disabled={isPending}>
            {isPending ? "Replacing..." : "Replace Scenes Manually"}
          </Button>
        </div>
      </form>

      {state.status !== "idle" ? (
        <p
          className={
            state.status === "error"
              ? "text-sm text-destructive"
              : "text-sm text-muted-foreground"
          }
          role={state.status === "error" ? "alert" : "status"}
        >
          {state.message}
        </p>
      ) : null}
    </div>
  );
}

function HandoffPreview({ validation }: { validation: SceneHandoffValidation }) {
  const { summary } = validation;

  return (
    <div className="rounded-md border bg-background p-3">
      <div className="font-medium">Preview</div>
      <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <PreviewItem label="Total scenes" value={summary.totalScenes} />
        <PreviewItem label="Avatars" value={summary.avatarScenes} />
        <PreviewItem label="Inserts" value={summary.insertScenes} />
        <PreviewItem label="Space" value={summary.spaceScenes} />
        <PreviewItem
          label="Total duration"
          value={`${Math.round(summary.totalDuration)}s`}
        />
        <PreviewItem
          label="Average duration"
          value={`${summary.averageDuration.toFixed(1)}s`}
        />
        <PreviewItem label="Main host" value={summary.mainHostScenes} />
        <PreviewItem
          label="Supporting character"
          value={summary.supportingCharacterScenes}
        />
        <PreviewItem label="INSERT tagged" value={summary.insertTaggedScenes} />
        <PreviewItem label="SPACE tagged" value={summary.spaceTaggedScenes} />
        <PreviewItem label="Hook section" value={summary.hookScenes} />
        <PreviewItem label="Body section" value={summary.bodyScenes} />
        <PreviewItem label="Other section" value={summary.otherSectionScenes} />
      </div>

      {Object.keys(summary.sectionCounts).length > 0 ? (
        <div className="mt-3 rounded border bg-muted/30 p-2 text-sm">
          <div className="text-xs uppercase text-muted-foreground">
            Sections
          </div>
          <div className="mt-1">
            {Object.entries(summary.sectionCounts)
              .map(([section, count]) => `${section}: ${count}`)
              .join(" · ")}
          </div>
        </div>
      ) : null}

      {validation.errors.length > 0 ? (
        <ValidationList
          title="Validation errors"
          items={validation.errors}
          variant="error"
        />
      ) : null}

      {validation.warnings.length > 0 ? (
        <ValidationList
          title="Validation warnings"
          items={validation.warnings}
          variant="warning"
        />
      ) : null}

      {validation.errors.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Parsed scenes are ready to import.
        </p>
      ) : null}
    </div>
  );
}

function PreviewItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded border bg-muted/30 p-2">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 font-semibold">{value}</div>
    </div>
  );
}

function ValidationList({
  title,
  items,
  variant,
}: {
  title: string;
  items: string[];
  variant: "error" | "warning";
}) {
  return (
    <div
      className={
        variant === "error"
          ? "mt-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
          : "mt-3 rounded-md border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm text-yellow-700 dark:text-yellow-300"
      }
    >
      <div className="font-medium">{title}</div>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

const promptSectionTitles = [
  "Channel Profile",
  "Project Bible",
  "Image Prompt Bible",
  "Character Bible",
  "Visual Planner Prompt",
  "Current Video Data",
] as const;

/** TheGodsWord channel key — illustrated Bible-study explainer compact-flow is scoped to this channel only. */
const THE_GODS_WORD_CHANNEL_KEY = "the-gods-word";

/** Set true to include full bibles in TheGodsWord ChatGPT scene requests (debug). */
const THE_GODS_WORD_FULL_CONTEXT = false;

function isTheGodsWordChannel(channelKey: string) {
  return channelKey === THE_GODS_WORD_CHANNEL_KEY;
}

function useTheGodsWordCompactFlowRequest(channelKey: string) {
  return isTheGodsWordChannel(channelKey) && !THE_GODS_WORD_FULL_CONTEXT;
}

type PromptSectionTitle = (typeof promptSectionTitles)[number];

const suspiciousMinimumLengths: Partial<Record<PromptSectionTitle, number>> = {
  "Project Bible": 1000,
  "Image Prompt Bible": 5000,
  "Character Bible": 5000,
  "Visual Planner Prompt": 10000,
};

function splitPromptSections(fullPrompt: string) {
  const sections = new Map<string, string>();

  promptSectionTitles.forEach((title) => {
    const marker = `# ${title}\n\n`;
    const start = fullPrompt.indexOf(marker);

    if (start === -1) {
      return;
    }

    const bodyStart = start + marker.length;
    const nextSectionStart = promptSectionTitles.reduce<number | null>(
      (nearestStart, nextTitle) => {
        const nextMarker = `\n\n---\n\n# ${nextTitle}\n\n`;
        const nextStart = fullPrompt.indexOf(nextMarker, bodyStart);

        if (nextStart === -1) {
          return nearestStart;
        }

        return nearestStart === null || nextStart < nearestStart
          ? nextStart
          : nearestStart;
      },
      null,
    );

    sections.set(
      title,
      fullPrompt.slice(bodyStart, nextSectionStart ?? undefined),
    );
  });

  return sections;
}

function findSuspiciousPromptSections(sections: Map<string, string>) {
  return promptSectionTitles.flatMap((title) => {
    const minimumLength = suspiciousMinimumLengths[title];

    if (!minimumLength) {
      return [];
    }

    const content = sections.get(title) ?? "";

    if (content.length >= minimumLength) {
      return [];
    }

    return `${title} is suspiciously short (${content.length} characters; expected at least ${minimumLength}). Verify the source file loaded completely before sending this request.`;
  });
}

// TheGodsWord compact-flow helpers below are used only when channelKey === "the-gods-word".
function buildTheGodsWordTimingRules() {
  return [
    "## Timing Rules",
    "",
    "Duration is stored as whole seconds. Use integer values only (for example 4, 5, 6, 7, 8).",
    "",
    "Hook scenes: 4 to 6 seconds.",
    "- Use 4 seconds for very short hook lines",
    "- Use 5 to 6 seconds for emotionally important hook beats",
    "",
    "Body scenes: 6 to 11 seconds.",
    "- Use 6 to 7 seconds for concise narration",
    "- Use 8 to 11 seconds for reflective, theological, or emotionally weighty narration",
    "",
    "Use shorter durations in the hook to keep the opening visually engaging.",
    "Do not use body-length scenes in the hook unless the hook line is unusually long.",
    "Do not let slow reflective pacing make the hook visually static.",
  ].join("\n");
}

function buildTheGodsWordFlowVisualBrief() {
  return [
    "## TheGodsWord Flow Visual Brief",
    "",
    "TheGodsWord is an English Christian reflective storytelling channel in an illustrated Bible-study explainer style.",
    "",
    "Visual style:",
    "16:9 horizontal hand-painted watercolor and ink Bible study illustration on warm off-white paper, soft sketch outlines, muted earth tones, wheat gold, olive green, dusty blue shadows, burnt umber soil, gentle parchment light, visible paper texture, loose brush texture, clean symbolic composition, calm reverent mood.",
    "",
    "Core rule:",
    "The assigned `scriptText` is the main director of the `imagePrompt`.",
    "",
    "Workflow:",
    "",
    "- Read the narration fragment.",
    "- Choose the best visual format (below).",
    "- Stage that format naturally with the style lock.",
    "- Do not default to generic skies, paths, lamps, or atmosphere when a card or diagram fits better.",
    "",
    "Section structure:",
    "For full videos, first mentally divide the script into clear teaching sections, usually 7 to 10 sections depending on script length.",
    "",
    "Each major section should begin with a section opener card.",
    "",
    "A section opener card is an `insert` scene that introduces the next teaching movement with:",
    "- a short exact visible title, usually 3 to 5 words",
    "- an optional short subtitle, usually 4 to 9 words",
    "- one simple illustrated object, symbol, or scene detail that represents the section",
    "- clean parchment background",
    "- large hand-lettered title and smaller subtitle",
    "- calm Bible-study explainer layout",
    "",
    "Use section opener cards to make the video feel structured, like a guided illustrated Bible study.",
    "",
    "Do not create section opener cards for every minor paragraph.",
    "Use them only when the script clearly moves to a new major idea.",
    "",
    "Represent section openers using existing fields only (no new schema fields):",
    "sceneType: insert, visualPurpose: opens the section, visualIdea: Section opener card: [TITLE], subtitle [SUBTITLE], with [symbol].",
    "",
    "Do not output the section map.",
    "Do not add section fields to the JSON.",
    "Use section planning only to decide where section opener cards belong.",
    "",
    "Visual format:",
    "For each scene, before writing the imagePrompt, choose the best visual format. Use it inside `visualIdea` and `imagePrompt`. No new schema field is required.",
    "",
    "1. `narrative scene` — biblical person, event, place, action, or moment.",
    "2. `object/detail insert` — close object or detail carries the line.",
    "3. `section opener card` — title, optional subtitle, one symbol; opens a major teaching section.",
    "4. `concept card` — core idea, thesis, or memorable phrase with exact short visible text.",
    "5. `scripture/reference card` — Scripture quote or Bible reference with exact short visible text.",
    "6. `comparison card` — compares two or more ideas.",
    "7. `devotional visual board` — explains a relationship, tension, process, or mechanism with title, labels, and layout.",
    "8. `simple diagram` — mechanism, process, structure, or cause/effect.",
    "9. `word-study card` — word, phrase, or definition.",
    "10. `question card` — direct reflective question.",
    "11. `atmosphere / space` — breath, transition, place-setting, road, garden, sky, or silence.",
    "",
    "Devotional visual boards:",
    "The reference style often uses devotional visual boards: designed teaching images that explain an idea, not just display a quote.",
    "",
    "Use a devotional visual board when the narration teaches a relationship, tension, process, contrast, or spiritual mechanism.",
    "",
    "A devotional visual board may include:",
    "- a short title",
    "- 2 to 4 short labels",
    "- arrows or a simple path",
    "- side-by-side contrast",
    "- cause/effect layout",
    "- before/after layout",
    "- one central biblical object with labeled meaning",
    "- small supporting illustrations",
    "",
    "Do not make most cards only display a single phrase.",
    "",
    "Weak: HE WAS HEARD with only a cup underneath.",
    "Better: HE WAS HEARD / prayer offered → cup remained → strength given",
    "",
    "Weak: THE CUP REMAINED with only a cup underneath.",
    "Better: THE CUP REMAINED / not removed / not ignored / strengthened",
    "",
    "Weak: TOO SMALL with only a decorative frame.",
    "Better: TOO SMALL / a narrow frame labeled what I asked, with the wider garden outside labeled what God was doing.",
    "",
    "Use exact short visible text only.",
    "Keep the board clean, readable, and uncluttered.",
    "Do not add random filler writing.",
    "",
    "Scene types:",
    "",
    "- `avatar`: narrative scenes with people or biblical figures.",
    "- `insert`: object/detail inserts, section opener cards, concept cards, scripture/reference cards, comparison cards, devotional visual boards, simple diagrams, word-study cards, and question cards.",
    "- `space`: atmosphere, locations, silence, roads, skies, transitions, and breathing room.",
    "",
    "Visual rhythm:",
    "Across a full plan, mix formats intentionally:",
    "- section opener cards for major new movements",
    "- narrative scenes for biblical moments",
    "- concept cards for thesis statements",
    "- comparison cards for tension or contrast",
    "- devotional visual boards for relationships, processes, and mechanisms",
    "- simple diagrams for process or cause/effect",
    "- object/detail inserts for memorable symbols",
    "- space scenes only for breath, transition, or place-setting",
    "",
    "Do not let the video become only landscapes, only quote cards, only character scenes, or only cup imagery.",
    "",
    "Text policy:",
    "",
    "Normal visual scenes: No text, no captions, no letters, no words.",
    "",
    "Card / board / diagram scenes (section opener, concept, comparison, devotional visual board, simple diagram, question, word-study, scripture/reference):",
    "- Ask Flow to render exact short visible text directly.",
    "- Use only the requested words, usually 2 to 8 words.",
    "- Use exact words from scriptText, `key_line`, or `main_scripture`.",
    "- Simple readable hand-lettered typography.",
    "- Do not invent Bible text. Do not paraphrase unless scriptText already does.",
    "- Avoid extra text, random letters, misspelled text, or filler writing.",
    "",
    "Narrative anchoring:",
    "When a reflective or theological fragment is still talking about a biblical moment, keep the image anchored in that biblical moment. Do not jump to a generic devotional metaphor too early.",
    "",
    "Weak: A quiet sky for \"He was heard.\"",
    "Better: Concept card: HE WAS HEARD, with Jesus still in Gethsemane and the cup remaining below the text.",
    "",
    "Weak: A generic believer with a lamp for \"our definition of answered prayer is too small.\"",
    "Better: Concept card: TOO SMALL, with a small boxed view showing only the cup while the wider garden continues outside the box.",
    "",
    "Weak: A generic path for \"That is the tension.\"",
    "Better: Comparison card: ASKED TO BE DELIVERED / STILL DIED / HEARD BY THE FATHER, with cup and distant cross.",
    "",
    "Basic restrictions:",
    "",
    "- No photorealism.",
    "- No 3D render.",
    "- No glossy digital art.",
    "- No cinematic realism.",
    "- No neon/cyberpunk.",
    "- No modern stock-photo look.",
    "- No clutter.",
    "- No watermark.",
    "- No random text.",
    "- No celebrity likeness.",
    "- Jesus must be reverent, simple, non-photorealistic, and not theatrical.",
    "",
    "ImagePrompt shape:",
    "",
    "For normal visual scenes:",
    "[style lock]. [Direct scene description based on the scriptText]. Simple composition, one focal idea, calm reverent mood. No text, no captions, no letters, no words. [negative restrictions].",
    "",
    "For concept / comparison / question / word-study cards:",
    "[style lock]. Clean Bible-study concept card with exact readable visible text: \"[TEXT]\". [Brief visual support from the scriptText, such as cup, seed, soil, path, olive branch, cross, or parchment]. Simple centered hand-lettered layout, calm reverent mood. Only the requested visible text. No extra words, no random letters, no misspelled text. [negative restrictions].",
    "",
    "For scripture/reference cards:",
    "[style lock]. Clean scripture reference card with exact readable visible text: \"[SHORT QUOTE]\" and smaller reference: \"[REFERENCE]\". Simple parchment layout, calm reverent mood. Only the requested visible text. No extra words, no random letters, no misspelled text. [negative restrictions].",
    "",
    "For devotional visual boards:",
    "[style lock]. Clean devotional visual board with exact readable visible title: \"[TITLE]\" and short labels: \"[LABEL 1]\", \"[LABEL 2]\", \"[LABEL 3]\". Use arrows, panels, side-by-side contrast, or a simple cause/effect layout to explain the relationship in the scriptText. Include one central biblical object or scene detail from the narration, such as cup, prayer, garden, cross, closed door, hands, or dawn light. Warm parchment background, clean hand-lettered layout, calm reverent mood. Only the requested visible text. No extra words, no random letters, no misspelled text. [negative restrictions].",
    "",
    "For section opener cards:",
    "[style lock]. Clean Bible-study section opener card with exact readable visible title: \"[TITLE]\" and smaller subtitle: \"[SUBTITLE]\". One simple illustrated object or symbol from the section, such as cup, olive branch, garden path, clay lamp, closed door, cross silhouette, empty tomb light, praying hands, or parchment. Large hand-lettered title, smaller subtitle, warm parchment background, calm reverent mood. Only the requested visible text. No extra words, no random letters, no misspelled text. [negative restrictions].",
    "",
    "For simple diagrams:",
    "[style lock]. Clean Bible-study diagram with exact readable visible labels: \"[LABELS]\". Use simple arrows, panels, or a process path to explain the mechanism in the scriptText. Include small supporting illustrations from the narration. Warm parchment background, clean hand-lettered layout, calm reverent mood. Only the requested visible text. No extra words, no random letters, no misspelled text. [negative restrictions].",
    "",
    "Section opener cards should feel like designed chapter cards, not generic quote cards.",
    "",
    "Keep prompts concise (usually 60–120 words).",
    "Do not write long theological explanations inside imagePrompt.",
    "",
    "visualPurpose: one short sentence explaining why the scene exists in the sequence.",
    "visualIdea: one plain visual sentence; name the visual format when helpful (for example Section opener card: THE CUP BEFORE HIM, subtitle MORE THAN SUFFERING, with clay cup on Gethsemane soil).",
  ].join("\n");
}

function buildTheGodsWordGenerationModeInstructions(mode: ChatGptGenerationMode) {
  if (mode === "FULL_VIDEO") {
    return [
      "GENERATION MODE:",
      "Generate the full visual plan for the complete script.",
      "Include section opener cards at major section boundaries.",
      "Usually 7 to 10 section opener cards for a long script. Do not overuse them.",
      "Return a JSON array only.",
    ].join("\n");
  }

  if (mode === "HOOK_TEST") {
    return [
      "GENERATION MODE:",
      "Generate only the hook scenes from the opening retention section.",
      "Usually include only one opener-style hook card if it fits.",
      "Do not force many section openers in the hook.",
      "Return a JSON array only.",
    ].join("\n");
  }

  if (mode === "TEN_SCENE_TEST") {
    return [
      "GENERATION MODE:",
      "Generate only the first 10 scenes from the script.",
      "Include a section opener only if the first 10 scenes naturally include the start of a major section.",
      "Return a JSON array only.",
    ].join("\n");
  }

  if (mode === "SEGMENTED_BY_PERCENT") {
    return [
      "GENERATION MODE:",
      "Generate scenes only for the Current Script Segment.",
      "Include a section opener only if this segment begins a major new teaching section.",
      "Return a JSON array only.",
    ].join("\n");
  }

  return generationModeInstructions(mode);
}

function parseCurrentVideoDataJson(currentVideoDataSection: string) {
  const trimmed = currentVideoDataSection.trim();

  if (!trimmed) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function pickIdeaJsonString(ideaJson: unknown, ...keys: string[]) {
  if (!ideaJson || typeof ideaJson !== "object" || Array.isArray(ideaJson)) {
    return undefined;
  }

  const record = ideaJson as Record<string, unknown>;

  for (const key of keys) {
    const value = record[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

function buildOptionalVisualContext(ideaJson: unknown) {
  const openingReference = pickIdeaJsonString(
    ideaJson,
    "visual_anchor",
    "visualAnchor",
  );
  const rawMotif =
    ideaJson && typeof ideaJson === "object" && !Array.isArray(ideaJson)
      ? ((ideaJson as Record<string, unknown>).main_visual_motif ??
        (ideaJson as Record<string, unknown>).mainVisualMotif)
      : undefined;

  let recurringElements: string[] | undefined;

  if (Array.isArray(rawMotif)) {
    recurringElements = rawMotif
      .filter(
        (value): value is string =>
          typeof value === "string" && value.trim().length > 0,
      )
      .map((value) => value.trim());
  } else if (typeof rawMotif === "string" && rawMotif.trim()) {
    recurringElements = [rawMotif.trim()];
  }

  if (
    !openingReference &&
    (!recurringElements || recurringElements.length === 0)
  ) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries({
      opening_reference: openingReference,
      recurring_elements:
        recurringElements && recurringElements.length > 0
          ? recurringElements
          : undefined,
    }).filter(([, value]) => value !== undefined),
  );
}

function buildCompactTheGodsWordCurrentVideoData(currentVideoDataSection: string) {
  const parsed = parseCurrentVideoDataJson(currentVideoDataSection);

  if (!parsed) {
    return currentVideoDataSection;
  }

  const ideaJson = parsed.ideaJson;
  const optionalVisualContext = buildOptionalVisualContext(ideaJson);
  const compact: Record<string, unknown> = {
    videoId: parsed.id,
    title: parsed.title,
    topic: parsed.topic,
    hook: pickIdeaJsonString(ideaJson, "hook"),
    key_line: pickIdeaJsonString(ideaJson, "key_line", "keyLine"),
    main_scripture: pickIdeaJsonString(
      ideaJson,
      "main_scripture",
      "mainScripture",
    ),
    ...(optionalVisualContext
      ? { optional_visual_context: optionalVisualContext }
      : {}),
    script: typeof parsed.script === "string" ? parsed.script : undefined,
  };

  return JSON.stringify(
    Object.fromEntries(
      Object.entries(compact).filter(
        ([, value]) => value !== undefined && value !== null && value !== "",
      ),
    ),
    null,
    2,
  );
}

function buildCompactVideoContextSection(compactVideoData: string) {
  return [
    "## Compact Video Context",
    "",
    "Optional visual context is only reference material. Do not force these elements into every scene. Use them only when the assigned scriptText naturally calls for them. The assigned scriptText always wins.",
    "",
    compactVideoData,
  ].join("\n");
}

function buildCompactSegmentInstructions() {
  return [
    "## Segment Instructions",
    "",
    "Generate scenes only for the Current Script Segment.",
    "Do not generate the full video.",
    "Do not generate scenes for script text outside the Current Script Segment.",
    "Preserve exact scriptText only from the Current Script Segment.",
    "Follow the TheGodsWord Flow Visual Brief.",
    "Return a JSON array only.",
    "Start scene order at 1 for this segment. The importer will normalize order on import.",
    "Use only the existing scene schema.",
    "Do not add new fields.",
  ].join("\n");
}

function buildCompactVisualContinuityGuidance() {
  return [
    "## Visual Continuity Guidance",
    "",
    "Continue the same watercolor/ink style from the Flow Visual Brief.",
    "Avoid repeating the exact same image twice in a row.",
    "The Current Script Segment remains the source of truth.",
  ].join("\n");
}

function buildOutputRequirementsSection() {
  return [
    "## Output Requirements",
    "",
    "Return valid JSON only.",
    "Return a JSON array only.",
    "Do not include markdown.",
    "Do not include explanations.",
    'Do not wrap the result inside an object.',
    'Do not include top-level keys like "scenes".',
    "Use only the existing scene schema:",
    "",
    "[",
    "{",
    '"order": 1,',
    '"scriptText": "",',
    '"sceneType": "avatar",',
    '"visualPurpose": "",',
    '"visualIdea": "",',
    '"duration": 4,',
    '"imagePrompt": "",',
    '"status": "planned"',
    "}",
    "]",
    "",
    "Do not add new fields.",
  ].join("\n");
}

function generationModeInstructions(mode: ChatGptGenerationMode) {
  if (mode === "FULL_VIDEO") {
    return [
      "GENERATION MODE:",
      "Generate the full visual plan for the complete script.",
      "Use the Visual Planner rules.",
      "Return a JSON array only.",
    ].join("\n");
  }

  if (mode === "TEN_SCENE_TEST") {
    return [
      "GENERATION MODE:",
      "Generate only the first 10 scenes from the script.",
      "This is a test of scene ratio, character universe, prompt quality, and image generation reliability.",
      "Return a JSON array only.",
    ].join("\n");
  }

  if (mode === "SEGMENTED_BY_PERCENT") {
    return [
      "GENERATION MODE:",
      "Generate scenes only for the Current Script Segment.",
      "Do not generate scenes for the rest of the script.",
      "Return a JSON array only.",
      "Use the existing scene schema.",
      "Do not add new fields.",
      "Start scene order at 1 for this segment.",
    ].join("\n");
  }

  return [
    "GENERATION MODE:",
    "Generate only the hook scenes from the opening retention section.",
    "Focus on the opening 45 to 120 seconds depending on script length.",
    "Return a JSON array only.",
  ].join("\n");
}

function buildSegmentInstructions() {
  return [
    "## Segment Instructions",
    "",
    "Generate scenes only for the Current Script Segment.",
    "Do not generate the full video.",
    "Do not generate scenes for script text outside the Current Script Segment.",
    "Preserve exact scriptText only from the Current Script Segment.",
    "Do not include scriptText from outside this segment.",
    "Continue the same visual style and continuity from the Image Prompt Bible and Character Bible.",
    "Return a JSON array only.",
    "Start scene order at 1 for this segment. The importer will normalize order on import.",
    "Use only the existing scene schema.",
    "Do not add new fields.",
  ].join("\n");
}

function buildVisualContinuityGuidance() {
  return [
    "## Visual Continuity Guidance",
    "",
    "Continue the same visual world, style, color palette, and character rules established by the channel bibles.",
    "Treat this segment as part of a longer video, not an isolated visual plan.",
    "Avoid unnecessary repetition of the same composition or visual idea from scene to scene.",
    "If a central motif returns, vary its composition, scale, camera distance, symbolic function, emotional tone, or surrounding elements.",
    "Prefer visual progression over simple repetition.",
    "Do not introduce a different art style just to create variety.",
    "Do not contradict the Current Script Segment.",
    "The Current Script Segment remains the source of truth.",
    "Generate scenes only for the Current Script Segment.",
  ].join("\n");
}

function buildCurrentScriptSegmentSection({
  script,
  startPercent,
  endPercent,
}: {
  script: string;
  startPercent: number;
  endPercent: number;
}) {
  const segment = extractScriptSegmentByPercent(script, startPercent, endPercent);

  const metadataLines = [
    `* startPercent: ${segment.startPercent}`,
    `* endPercent: ${segment.endPercent}`,
    `* approximateCharacterRange: ${segment.startChar}-${segment.endChar}`,
    `* segmentLength: ${segment.segmentLength}`,
    `* fullScriptLength: ${segment.fullScriptLength}`,
  ];

  if (segment.extractionWarning) {
    metadataLines.push(`* extractionWarning: ${segment.extractionWarning}`);
  }

  if (segment.startCutReason) {
    metadataLines.push(`* startCutReason: ${segment.startCutReason}`);
  }

  if (segment.endCutReason) {
    metadataLines.push(`* endCutReason: ${segment.endCutReason}`);
  }

  return [
    "## Current Script Segment",
    "",
    ...metadataLines,
    "",
    segment.fragment || "(No script text found for this segment.)",
  ].join("\n");
}

function buildChatGptRequest({
  fullPrompt,
  mode,
  videoId,
  videoTitle,
  channelKey,
  projectBiblePath,
  imagePromptBiblePath,
  characterBiblePath,
  visualPlannerPath,
  scriptLength,
  segmentRange,
}: {
  fullPrompt: string;
  mode: ChatGptGenerationMode;
  videoId: string;
  videoTitle: string;
  channelKey: string;
  projectBiblePath: string;
  imagePromptBiblePath: string;
  characterBiblePath?: string;
  visualPlannerPath: string;
  scriptLength: number;
  segmentRange?: {
    startPercent: number;
    endPercent: number;
  };
}): { request: string; warnings: string[] } {
  const sections = splitPromptSections(fullPrompt);
  const projectBible = sections.get("Project Bible") ?? "";
  const imagePromptBible = sections.get("Image Prompt Bible") ?? "";
  const characterBible = sections.get("Character Bible") ?? "";
  const visualPlannerPrompt = sections.get("Visual Planner Prompt") ?? "";
  const currentVideoData = sections.get("Current Video Data") ?? "";
  const useCompactTheGodsWordRequest = useTheGodsWordCompactFlowRequest(channelKey);
  const warnings = useCompactTheGodsWordRequest
    ? []
    : findSuspiciousPromptSections(sections);

  if (mode === "SEGMENTED_BY_PERCENT" && segmentRange) {
    const script = parseScriptFromCurrentVideoData(currentVideoData);

    if (!script?.trim()) {
      warnings.push(
        "Current Video Data does not include a usable script. Segmented generation may fail until a script is saved on the video.",
      );
    }
  }

  const segmentedSections =
    mode === "SEGMENTED_BY_PERCENT" && segmentRange
      ? (() => {
          const script = parseScriptFromCurrentVideoData(currentVideoData) ?? "";

          return [
            useCompactTheGodsWordRequest
              ? buildCompactSegmentInstructions()
              : buildSegmentInstructions(),
            useCompactTheGodsWordRequest
              ? buildCompactVisualContinuityGuidance()
              : buildVisualContinuityGuidance(),
            buildCurrentScriptSegmentSection({
              script,
              startPercent: segmentRange.startPercent,
              endPercent: segmentRange.endPercent,
            }),
          ];
        })()
      : [];

  const timingRulesSection = isTheGodsWordChannel(channelKey)
    ? [buildTheGodsWordTimingRules()]
    : [];

  if (useCompactTheGodsWordRequest) {
    const compactVideoData =
      buildCompactTheGodsWordCurrentVideoData(currentVideoData);

    const request = [
      "# ChatGPT Scene Generation Request",
      "## Task\n\nGenerate Scenes JSON for the current video.",
      `## Generation Mode\n\n${mode}`,
      [
        "## Prompt Context Snapshot",
        "",
        `* generatedAt: ${new Date().toISOString()}`,
        `* videoId: ${videoId}`,
        `* videoTitle: ${videoTitle}`,
        `* channelKey: ${channelKey}`,
        `* requestFormat: compact-flow`,
        `* scriptLength: ${scriptLength}`,
        ...(segmentRange
          ? [
              `* segmentStartPercent: ${segmentRange.startPercent}`,
              `* segmentEndPercent: ${segmentRange.endPercent}`,
            ]
          : []),
      ].join("\n"),
      buildTheGodsWordFlowVisualBrief(),
      buildCompactVideoContextSection(compactVideoData),
      ...segmentedSections,
      ...timingRulesSection,
      buildOutputRequirementsSection(),
      buildTheGodsWordGenerationModeInstructions(mode),
    ].join("\n\n");

    return { request, warnings };
  }

  const request = [
    "# ChatGPT Scene Generation Request",
    "## Task\n\nGenerate Scenes JSON for the current video.",
    `## Generation Mode\n\n${mode}`,
    [
      "## Prompt Context Snapshot",
      "",
      `* generatedAt: ${new Date().toISOString()}`,
      `* videoId: ${videoId}`,
      `* videoTitle: ${videoTitle}`,
      `* channelKey: ${channelKey}`,
      `* projectBiblePath: ${projectBiblePath}`,
      `* imagePromptBiblePath: ${imagePromptBiblePath}`,
      `* characterBiblePath: ${characterBiblePath ?? "none"}`,
      `* visualPlannerPath: ${visualPlannerPath}`,
      `* projectBibleLength: ${projectBible.length}`,
      `* imagePromptBibleLength: ${imagePromptBible.length}`,
      `* characterBibleLength: ${characterBible.length}`,
      `* visualPlannerLength: ${visualPlannerPrompt.length}`,
      `* scriptLength: ${scriptLength}`,
      ...(segmentRange
        ? [
            `* segmentStartPercent: ${segmentRange.startPercent}`,
            `* segmentEndPercent: ${segmentRange.endPercent}`,
          ]
        : []),
    ].join("\n"),
    `## Channel Profile\n\n${sections.get("Channel Profile") ?? ""}`,
    `## Project Bible\n\n${projectBible}`,
    `## Image Prompt Bible\n\n${imagePromptBible}`,
    `## Characters Bible\n\n${characterBible}`,
    `## Visual Planner Prompt\n\n${visualPlannerPrompt}`,
    `## Current Video Data\n\n${currentVideoData}`,
    ...segmentedSections,
    ...timingRulesSection,
    buildOutputRequirementsSection(),
    generationModeInstructions(mode),
  ].join("\n\n");

  return { request, warnings };
}
