"use client";

import { Check, Copy, Loader2, Play } from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { isBibleOneYearCategory } from "@/lib/the-bible-in-one-year-shared";
import {
  BIBLE_ONE_YEAR_SECTION_MAX_DAYS,
  BIBLE_ONE_YEAR_TOTAL_DAYS,
  bibleOneYearSectionDayCount,
  buildBibleOneYearSectionPresets,
  normalizeBibleOneYearSectionRange,
  suggestNextBibleOneYearSection,
} from "@/lib/the-bible-in-one-year-topic-batch";
import type { TopicAngleLane } from "@/lib/channels";
import {
  buildTopicBatchPrompt,
  type RecentTopicContext,
  type TopicCategoryOption,
  type TopicEditorialInstructions,
} from "@/lib/topic-batch-prompt";

type TopicQueueToolsProps = {
  channelKey: string;
  channelName: string;
  categories: TopicCategoryOption[];
  editorialInstructions: TopicEditorialInstructions;
  recentTopics: RecentTopicContext[];
  outlierAngleLanes?: TopicAngleLane[];
  selectedCategoryId?: string;
  coveredBibleOneYearDays?: number[];
  importAction: (formData: FormData) => void | Promise<void>;
  runBatchAction: (formData: FormData) => void | Promise<void>;
  initialTopicBatchJson?: string;
};

function parseTopicBatch(value: string) {
  const data = JSON.parse(value) as unknown;

  if (!data || typeof data !== "object" || !Array.isArray((data as { topics?: unknown }).topics)) {
    throw new Error("JSON must contain a topics array.");
  }

  const topics = (data as { topics: unknown[] }).topics;
  topics.forEach((topic, index) => {
    if (!topic || typeof topic !== "object") {
      throw new Error(`Topic ${index + 1} must be an object.`);
    }

    const item = topic as Record<string, unknown>;
    ["category", "title", "topic"].forEach((key) => {
      if (typeof item[key] !== "string" || !item[key].trim()) {
        throw new Error(`Topic ${index + 1} is missing ${key}.`);
      }
    });
  });

  return topics.length;
}

export function TopicQueueTools({
  channelKey,
  channelName,
  categories,
  editorialInstructions,
  recentTopics,
  outlierAngleLanes = [],
  selectedCategoryId = "",
  coveredBibleOneYearDays = [],
  importAction,
  runBatchAction,
  initialTopicBatchJson = "",
}: TopicQueueToolsProps) {
  const isBibleOneYear = isBibleOneYearCategory(selectedCategoryId);
  const sectionPresets = useMemo(() => buildBibleOneYearSectionPresets(), []);
  const suggestedSection = useMemo(
    () => suggestNextBibleOneYearSection(coveredBibleOneYearDays),
    [coveredBibleOneYearDays],
  );

  const [count, setCount] = useState("14");
  const [startDay, setStartDay] = useState(String(suggestedSection.startDay));
  const [endDay, setEndDay] = useState(String(suggestedSection.endDay));
  const [copied, setCopied] = useState(false);
  const [jsonText, setJsonText] = useState(initialTopicBatchJson);
  const [parseMessage, setParseMessage] = useState(
    initialTopicBatchJson
      ? "Loaded latest ChatGPT topic batch draft. Parse or Import Topics."
      : "",
  );
  const [isRunning, startRunTransition] = useTransition();
  const selectedCategory = categories.find((item) => item.id === selectedCategoryId);

  useEffect(() => {
    if (!initialTopicBatchJson) {
      return;
    }

    setJsonText(initialTopicBatchJson);
    setParseMessage(
      "Loaded latest ChatGPT topic batch draft. Parse or Import Topics.",
    );
  }, [initialTopicBatchJson]);

  useEffect(() => {
    if (!isBibleOneYear) {
      return;
    }
    setStartDay(String(suggestedSection.startDay));
    setEndDay(String(suggestedSection.endDay));
  }, [isBibleOneYear, suggestedSection.endDay, suggestedSection.startDay]);

  const bibleSection = useMemo(() => {
    if (!isBibleOneYear) {
      return null;
    }
    return normalizeBibleOneYearSectionRange(Number(startDay), Number(endDay));
  }, [endDay, isBibleOneYear, startDay]);

  const effectiveCount = bibleSection
    ? String(bibleOneYearSectionDayCount(bibleSection))
    : count;

  const prompt = useMemo(
    () =>
      buildTopicBatchPrompt({
        channelName,
        count: effectiveCount,
        selectedCategoryId,
        categories,
        editorialInstructions,
        recentTopics,
        outlierAngleLanes,
        bibleOneYearSection: bibleSection,
        coveredBibleOneYearDays,
      }),
    [
      bibleSection,
      categories,
      channelName,
      coveredBibleOneYearDays,
      editorialInstructions,
      effectiveCount,
      outlierAngleLanes,
      recentTopics,
      selectedCategoryId,
    ],
  );

  async function copyPrompt() {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  function parseBatch() {
    try {
      const parsedCount = parseTopicBatch(jsonText);
      const parsed = JSON.parse(jsonText) as {
        topics: Array<Record<string, unknown> & { category?: string }>;
      };
      const mismatchCount =
        selectedCategoryId
          ? parsed.topics.filter((topic) => topic.category !== selectedCategoryId).length
          : 0;
      const requiredFields = isBibleOneYear
        ? [
            "category",
            "title",
            "topic",
            "dayNumber",
            "todayReadingDisplay",
            "chapters",
          ]
        : [
            "category",
            "title",
            "topic",
            "angle",
            "uniqueMechanism",
            "trigger",
            "promise",
            "visualHook",
            "thumbnailIdea",
            "repetitionRisk",
          ];
      const missingNewFieldCount = parsed.topics.filter((topic) =>
        requiredFields.some((field) => {
          const value = topic[field];
          if (field === "dayNumber") {
            return !(typeof value === "number" || typeof value === "string");
          }
          if (field === "chapters") {
            return !Array.isArray(value) || value.length === 0;
          }
          return typeof value !== "string" || !String(value).trim();
        }),
      ).length;
      const mismatchMessage =
        mismatchCount > 0
          ? ` Some imported topics do not match the selected category. They can still be imported.`
          : "";
      const missingFieldMessage =
        missingNewFieldCount > 0
          ? ` ${missingNewFieldCount} topics are missing one or more newer editorial fields; missing values will import as empty.`
          : "";
      setParseMessage(
        `Valid JSON. ${parsedCount} topics ready to import.${mismatchMessage}${missingFieldMessage}`,
      );
    } catch (error) {
      setParseMessage(error instanceof Error ? error.message : "Invalid topic batch JSON.");
    }
  }

  function onRunBatch(formData: FormData) {
    startRunTransition(async () => {
      await runBatchAction(formData);
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="space-y-4 rounded-md border bg-muted/20 p-4">
        <div>
          <h3 className="text-sm font-semibold">Topic Batch Generator</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {isBibleOneYear
              ? "Generate ordered Bible-in-One-Year day sections (up to 30 days per batch, 365 total) into the Daily Topic Queue."
              : "Copy for manual ChatGPT, or Run Batch to send the same request through Chrome CDP (Google-logged ChatGPT) and fill the Daily Topic Queue."}
          </p>
        </div>

        {isBibleOneYear ? (
          <div className="space-y-3">
            <div className="grid gap-2">
              <Label htmlFor="bibleOneYearSectionPreset">Year section</Label>
              <select
                id="bibleOneYearSectionPreset"
                value={`${bibleSection?.startDay}-${bibleSection?.endDay}`}
                onChange={(event) => {
                  const preset = sectionPresets.find(
                    (item) =>
                      `${item.startDay}-${item.endDay}` === event.target.value,
                  );
                  if (!preset) {
                    return;
                  }
                  setStartDay(String(preset.startDay));
                  setEndDay(String(preset.endDay));
                }}
                className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                disabled={isRunning}
              >
                {sectionPresets.map((preset) => (
                  <option
                    key={preset.id}
                    value={`${preset.startDay}-${preset.endDay}`}
                  >
                    {preset.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="bibleOneYearStartDay">Start day</Label>
                <Input
                  id="bibleOneYearStartDay"
                  type="number"
                  min={1}
                  max={BIBLE_ONE_YEAR_TOTAL_DAYS}
                  value={startDay}
                  onChange={(event) => setStartDay(event.target.value)}
                  disabled={isRunning}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="bibleOneYearEndDay">End day</Label>
                <Input
                  id="bibleOneYearEndDay"
                  type="number"
                  min={1}
                  max={BIBLE_ONE_YEAR_TOTAL_DAYS}
                  value={endDay}
                  onChange={(event) => setEndDay(event.target.value)}
                  disabled={isRunning}
                />
              </div>
            </div>

            <div className="rounded-md border bg-background px-3 py-2 text-xs text-muted-foreground">
              <p>
                This batch will request{" "}
                <span className="font-medium text-foreground">
                  {effectiveCount} days
                </span>{" "}
                ({bibleSection?.startDay}–{bibleSection?.endDay}). Max{" "}
                {BIBLE_ONE_YEAR_SECTION_MAX_DAYS} days per section ·{" "}
                {BIBLE_ONE_YEAR_TOTAL_DAYS} days in the full year.
              </p>
              <p className="mt-1">
                Covered days already in queue:{" "}
                {coveredBibleOneYearDays.length > 0
                  ? coveredBibleOneYearDays.join(", ")
                  : "none yet"}
              </p>
              <p className="mt-1">
                Suggested next section: Days {suggestedSection.startDay}–
                {suggestedSection.endDay}
              </p>
            </div>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="topicBatchCount">Number of topics</Label>
              <Input
                id="topicBatchCount"
                type="number"
                inputMode="numeric"
                min={1}
                max={28}
                step={1}
                value={count}
                onChange={(event) => setCount(event.target.value)}
                onBlur={() => {
                  const parsed = Number.parseInt(count, 10);
                  if (!Number.isFinite(parsed)) {
                    setCount("14");
                    return;
                  }
                  setCount(String(Math.max(1, Math.min(28, parsed))));
                }}
                disabled={isRunning}
              />
            </div>

            <div className="grid gap-2">
              <Label>Topic request mode</Label>
              <div className="flex min-h-9 items-center rounded-md border bg-background px-3 py-2 text-sm">
                {selectedCategory
                  ? `Focused: ${selectedCategory.label}`
                  : `Balanced across all ${channelName} categories`}
              </div>
            </div>
          </div>
        )}

        {!isBibleOneYear ? null : (
          <div className="grid gap-2">
            <Label>Topic request mode</Label>
            <div className="flex min-h-9 items-center rounded-md border bg-background px-3 py-2 text-sm">
              Focused: {selectedCategory?.label ?? "The Bible in One Year"}
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={copyPrompt} disabled={isRunning}>
            {copied ? <Check /> : <Copy />}
            {copied ? "Copied" : "Copy Topic Batch Request"}
          </Button>

          <form action={onRunBatch}>
            <input type="hidden" name="channelKey" value={channelKey} />
            <input type="hidden" name="selectedCategory" value={selectedCategoryId} />
            <input type="hidden" name="topicBatchCount" value={effectiveCount} />
            {bibleSection ? (
              <>
                <input
                  type="hidden"
                  name="bibleOneYearStartDay"
                  value={bibleSection.startDay}
                />
                <input
                  type="hidden"
                  name="bibleOneYearEndDay"
                  value={bibleSection.endDay}
                />
              </>
            ) : null}
            <Button type="submit" disabled={isRunning}>
              {isRunning ? <Loader2 className="animate-spin" /> : <Play />}
              {isRunning ? "Running Batch…" : "Run Batch"}
            </Button>
          </form>
        </div>

        <div className="grid gap-1 rounded-md border bg-background px-3 py-2 text-xs text-muted-foreground">
          <p>
            Prompt context: Category mode: {selectedCategory ? "Focused" : "Balanced"}
          </p>
          <p>Recent topics included: {recentTopics.length}</p>
          <p>
            {isBibleOneYear
              ? "Reading-plan continuity: Included"
              : "Editorial instructions: Included"}
          </p>
          <p>Anti-repetition context: Included</p>
          <p>
            Run Batch uses Chrome CDP at{" "}
            <code className="rounded bg-muted px-1">CHATGPT_CDP_URL</code> /{" "}
            <code className="rounded bg-muted px-1">9222</code> with ChatGPT logged
            in via Google.
          </p>
        </div>
      </section>

      <section className="space-y-4 rounded-md border bg-muted/20 p-4">
        <div>
          <h3 className="text-sm font-semibold">Import Topic Batch</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Manual fallback: paste the JSON response, validate it, then save new
            topics. Run Batch imports automatically when ChatGPT finishes.
          </p>
        </div>

        <form action={importAction} className="space-y-3">
          <input type="hidden" name="channelKey" value={channelKey} />
          <input type="hidden" name="selectedCategory" value={selectedCategoryId} />
          <div className="grid gap-2">
            <Label htmlFor="topicBatchJson">Paste Topic Batch JSON</Label>
            <Textarea
              id="topicBatchJson"
              name="topicBatchJson"
              className="min-h-56 font-mono text-sm"
              value={jsonText}
              onChange={(event) => {
                setJsonText(event.target.value);
                setParseMessage("");
              }}
              placeholder={
                isBibleOneYear
                  ? '{"topics":[{"category":"the_bible_in_one_year","dayNumber":1,"title":"Day 1 — Genesis 1–2","topic":"Genesis 1–2","chapters":[]}]}'
                  : '{"topics":[{"category":"category_id","title":"","topic":""}]}'
              }
              disabled={isRunning}
            />
          </div>

          {parseMessage ? (
            <p className="text-xs text-muted-foreground">{parseMessage}</p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={parseBatch} disabled={isRunning}>
              Parse Topic Batch
            </Button>
            <Button type="submit" disabled={isRunning}>
              Import Topics
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}

/** @deprecated Prefer TopicQueueTools */
export const WealthTopicQueueTools = TopicQueueTools;
