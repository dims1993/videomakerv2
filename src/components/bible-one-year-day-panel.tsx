"use client";

import { useMemo, useState, useTransition } from "react";

import { saveBibleOneYearDayConfigAction, loadBibleOneYearPlanDayAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type {
  BibleOneYearDayConfig,
  BibleOneYearJourneyState,
} from "@/lib/the-bible-in-one-year-shared";

type BibleOneYearDayPanelProps = {
  videoId: string;
  initialConfig: BibleOneYearDayConfig | null;
  journey: BibleOneYearJourneyState;
  suggestedDayNumber: number;
};

function stringifyPrayerPoints(points: string[]) {
  return points.join("\n");
}

function parsePrayerPoints(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function BibleOneYearDayPanel({
  videoId,
  initialConfig,
  journey,
  suggestedDayNumber,
}: BibleOneYearDayPanelProps) {
  const [isPending, startTransition] = useTransition();
  const [dayNumber, setDayNumber] = useState(
    String(initialConfig?.dayNumber ?? suggestedDayNumber),
  );
  const [journeyAction, setJourneyAction] = useState<"begin" | "continue">(
    initialConfig?.journeyAction ??
      (Number(dayNumber) === 1 ? "begin" : "continue"),
  );
  const [todayReadingDisplay, setTodayReadingDisplay] = useState(
    initialConfig?.todayReadingDisplay ?? "",
  );
  const [nextReadingDisplay, setNextReadingDisplay] = useState(
    initialConfig?.nextReadingDisplay ?? "",
  );
  const [listeningFocus, setListeningFocus] = useState(
    initialConfig?.listeningFocus ?? "",
  );
  const [reflectionMainThought, setReflectionMainThought] = useState(
    initialConfig?.reflectionMainThought ?? "",
  );
  const [reflectionApplication, setReflectionApplication] = useState(
    initialConfig?.reflectionApplication ?? "",
  );
  const [prayerPoints, setPrayerPoints] = useState(
    stringifyPrayerPoints(initialConfig?.prayerPoints ?? []),
  );
  const [chapterBlocksJson, setChapterBlocksJson] = useState(
    JSON.stringify(initialConfig?.chapterBlocks ?? [], null, 2),
  );
  const [error, setError] = useState("");

  const journeySummary = useMemo(
    () => [
      `Last completed day: ${journey.lastCompletedDay || "none"}`,
      `Suggested next day: ${journey.nextDayNumber}`,
      journey.completedDays.length > 0
        ? `Completed: ${journey.completedDays.join(", ")}`
        : "Completed: none",
      journey.inProgressDays.length > 0
        ? `In progress: ${journey.inProgressDays.join(", ")}`
        : null,
    ]
      .filter(Boolean)
      .join(" · "),
    [journey],
  );

  function loadFromPlan() {
    setError("");
    startTransition(async () => {
      try {
        const result = await loadBibleOneYearPlanDayAction(
          videoId,
          Number(dayNumber) || suggestedDayNumber,
        );
        const config = result.dayConfig;
        setDayNumber(String(config.dayNumber));
        setJourneyAction(config.journeyAction);
        setTodayReadingDisplay(config.todayReadingDisplay);
        setNextReadingDisplay(config.nextReadingDisplay);
        setListeningFocus(config.listeningFocus);
        setReflectionMainThought(config.reflectionMainThought);
        setReflectionApplication(config.reflectionApplication);
        setPrayerPoints(stringifyPrayerPoints(config.prayerPoints));
        setChapterBlocksJson(JSON.stringify(config.chapterBlocks, null, 2));
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load day from reading plan.",
        );
      }
    });
  }

  function saveConfig() {
    setError("");

    let chapterBlocks: BibleOneYearDayConfig["chapterBlocks"] = [];
    try {
      const parsed = JSON.parse(chapterBlocksJson) as unknown;
      if (!Array.isArray(parsed)) {
        throw new Error("Chapter blocks must be a JSON array.");
      }
      chapterBlocks = parsed as BibleOneYearDayConfig["chapterBlocks"];
    } catch (parseError) {
      setError(
        parseError instanceof Error
          ? parseError.message
          : "Chapter blocks JSON is invalid.",
      );
      return;
    }

    const formData = new FormData();
    formData.set("dayNumber", dayNumber);
    formData.set("journeyAction", journeyAction);
    formData.set("todayReadingDisplay", todayReadingDisplay);
    formData.set("nextReadingDisplay", nextReadingDisplay);
    formData.set("listeningFocus", listeningFocus);
    formData.set("reflectionMainThought", reflectionMainThought);
    formData.set("reflectionApplication", reflectionApplication);
    formData.set("prayerPoints", prayerPoints);
    formData.set("chapterBlocksJson", JSON.stringify(chapterBlocks));

    startTransition(async () => {
      try {
        await saveBibleOneYearDayConfigAction(videoId, formData);
      } catch (saveError) {
        setError(
          saveError instanceof Error
            ? saveError.message
            : "Could not save Bible in One Year day config.",
        );
      }
    });
  }

  return (
    <div className="space-y-4 rounded-md border bg-muted/20 p-4">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">The Bible in One Year — Day Setup</h3>
        <p className="text-xs text-muted-foreground">{journeySummary}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="bibleOneYearDayNumber">Day number</Label>
          <Input
            id="bibleOneYearDayNumber"
            type="number"
            min={1}
            value={dayNumber}
            onChange={(event) => setDayNumber(event.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="bibleOneYearJourneyAction">Journey action</Label>
          <select
            id="bibleOneYearJourneyAction"
            value={journeyAction}
            onChange={(event) =>
              setJourneyAction(event.target.value as "begin" | "continue")
            }
            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
          >
            <option value="begin">begin</option>
            <option value="continue">continue</option>
          </select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="bibleOneYearTodayReading">Today&apos;s reading</Label>
          <Input
            id="bibleOneYearTodayReading"
            value={todayReadingDisplay}
            onChange={(event) => setTodayReadingDisplay(event.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="bibleOneYearNextReading">Next reading</Label>
          <Input
            id="bibleOneYearNextReading"
            value={nextReadingDisplay}
            onChange={(event) => setNextReadingDisplay(event.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="bibleOneYearListeningFocus">Listening focus</Label>
        <Textarea
          id="bibleOneYearListeningFocus"
          value={listeningFocus}
          onChange={(event) => setListeningFocus(event.target.value)}
          rows={2}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="bibleOneYearReflectionMainThought">
            Reflection main thought
          </Label>
          <Textarea
            id="bibleOneYearReflectionMainThought"
            value={reflectionMainThought}
            onChange={(event) => setReflectionMainThought(event.target.value)}
            rows={3}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="bibleOneYearReflectionApplication">
            Reflection application
          </Label>
          <Textarea
            id="bibleOneYearReflectionApplication"
            value={reflectionApplication}
            onChange={(event) => setReflectionApplication(event.target.value)}
            rows={3}
          />
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="bibleOneYearPrayerPoints">Prayer points (one per line)</Label>
        <Textarea
          id="bibleOneYearPrayerPoints"
          value={prayerPoints}
          onChange={(event) => setPrayerPoints(event.target.value)}
          rows={4}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="bibleOneYearChapterBlocks">
          Chapter blocks JSON (book + chapter required;{" "}
          <code>webusText</code> optional)
        </Label>
        <p className="text-xs text-muted-foreground">
          Topic Batch can leave <code>webusText</code> empty. Script Run Batch
          will instruct ChatGPT to use authentic WEBUS for those exact chapters
          only, without inventing or mixing translations. Paste WEBUS text here
          only if you want to force exact supplied wording.
        </p>
        <Textarea
          id="bibleOneYearChapterBlocks"
          value={chapterBlocksJson}
          onChange={(event) => setChapterBlocksJson(event.target.value)}
          rows={12}
          className="font-mono text-xs"
        />
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={loadFromPlan}
          disabled={isPending}
        >
          Load day {dayNumber || suggestedDayNumber} from reading plan
        </Button>
        <Button type="button" onClick={saveConfig} disabled={isPending}>
          {isPending ? "Saving…" : "Save Bible in One Year day config"}
        </Button>
      </div>
    </div>
  );
}
