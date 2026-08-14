import { prisma } from "@/lib/prisma";
import { buildOverlapAwareSceneDurations } from "@/lib/music-bed-stitch";
import { isMusicBedScene, MUSIC_BED_PROVIDER } from "@/lib/music-beds";
import {
  isPodcastSectionClipVisualIdea,
  sectionClipTagFromVisualIdea,
} from "@/lib/podcast-video-library-shared";
import {
  extractPartCoverDisplayTitle,
  isPartCoverVisualIdea,
} from "@/lib/podcast-part-covers";

export type YoutubeChapter = {
  startSec: number;
  timestamp: string;
  title: string;
  source:
    | "section_opener"
    | "script_marker"
    | "intro"
    | "section_clip"
    | "part_cover";
  sceneOrder: number | null;
};

export type YoutubeChaptersExport = {
  videoId: string;
  title: string;
  chapters: YoutubeChapter[];
  youtubeDescriptionBlock: string;
  timedScript: string;
  downloadText: string;
};

type SceneTimingRow = {
  sortOrder: number;
  scriptText: string;
  visualPurpose: string | null;
  visualIdea: string | null;
  duration: number | null;
  voiceoverDuration: number | null;
  pauseAfterMs: number | null;
  voiceoverProvider?: string | null;
};

type ParsedScriptChapter = {
  index: number;
  title: string;
  marker: string;
  body: string;
};

const chapterMarkerRegex =
  /\[CHAPTER\s+(\d+)\s*[—–\-]\s*([^\]]+)\]/gi;

function normalizeTitle(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sceneRenderDurationSec(
  scene: SceneTimingRow,
  overlapAwareDurations?: Map<number, number>,
) {
  const overlapAware = overlapAwareDurations?.get(scene.sortOrder);
  if (typeof overlapAware === "number" && Number.isFinite(overlapAware)) {
    return overlapAware;
  }

  if (
    typeof scene.voiceoverDuration === "number" &&
    Number.isFinite(scene.voiceoverDuration)
  ) {
    return (
      scene.voiceoverDuration + Math.max(0, (scene.pauseAfterMs ?? 0) / 1000)
    );
  }

  if (typeof scene.duration === "number" && Number.isFinite(scene.duration)) {
    return Math.max(0, scene.duration);
  }

  return 0;
}

export function formatYoutubeTimestamp(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const paddedSeconds = seconds.toString().padStart(2, "0");

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${paddedSeconds}`;
  }

  return `${minutes}:${paddedSeconds}`;
}

function extractSectionOpenerTitle(visualIdea: string | null | undefined) {
  if (!visualIdea) {
    return null;
  }

  const match = visualIdea.match(
    /section\s+opener\s+card:\s*([^,\n]+)/i,
  );

  return match?.[1]?.trim() || null;
}

function cleanChapterTitle(value: string) {
  return value
    .replace(/^MAIN HOST:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateChapterTitle(value: string, maxLength = 70) {
  const cleaned = cleanChapterTitle(value);
  if (cleaned.length <= maxLength) {
    return cleaned;
  }

  const sliced = cleaned.slice(0, maxLength);
  const lastSpace = sliced.lastIndexOf(" ");
  return (lastSpace > 40 ? sliced.slice(0, lastSpace) : sliced).trim();
}

/**
 * Detect true section/trap openers — not closings or any purpose that
 * merely mentions the word "section".
 */
function isSectionOpenerScene(scene: SceneTimingRow) {
  const purpose = scene.visualPurpose?.trim() ?? "";
  const idea = scene.visualIdea?.trim() ?? "";
  const purposeLower = purpose.toLowerCase();
  const ideaLower = idea.toLowerCase();

  if (
    ideaLower.includes("section opener") ||
    ideaLower.startsWith("section opener card:")
  ) {
    return true;
  }

  // Explicit opener wording in visualPurpose
  if (
    /^opens?\s+(the\s+)?section\b/i.test(purpose) ||
    /^open\s+(the\s+)?(trap|section)\b/i.test(purpose) ||
    purposeLower.startsWith("opens the section") ||
    purposeLower.startsWith("open trap")
  ) {
    return true;
  }

  return false;
}

function isPodcastStructureChapterScene(scene: SceneTimingRow) {
  return (
    isPodcastSectionClipVisualIdea(scene.visualIdea) ||
    isPartCoverVisualIdea(scene.visualIdea)
  );
}

function titleCaseWords(value: string) {
  return value
    .toLowerCase()
    .replace(/\b([a-z])/g, (char) => char.toUpperCase());
}

function humanizePartChapterTitle(displayTitle: string) {
  const match = displayTitle
    .trim()
    .match(/^PART\s+(\d+)\s*[—–\-]\s*(.+)$/i);
  if (match?.[1] && match[2]) {
    return truncateChapterTitle(
      `Part ${match[1]} — ${titleCaseWords(match[2])}`,
    );
  }
  return truncateChapterTitle(displayTitle);
}

function extractPodcastStructureChapter(
  scene: SceneTimingRow,
): { title: string; source: "section_clip" | "part_cover" } | null {
  const sectionTag = sectionClipTagFromVisualIdea(scene.visualIdea);
  if (sectionTag) {
    const titles: Record<string, string> = {
      INTRO: "Intro",
      LESSON: "Lesson",
      CLOSING: "Closing",
      FINAL: "Final",
    };
    return {
      title: titles[sectionTag] ?? titleCaseWords(sectionTag),
      source: "section_clip",
    };
  }

  if (isPartCoverVisualIdea(scene.visualIdea)) {
    const displayTitle =
      extractPartCoverDisplayTitle({
        visualIdea: scene.visualIdea,
        scriptText: scene.scriptText,
      }) ?? scene.scriptText.trim();
    if (!displayTitle) {
      return {
        title: `Part scene ${scene.sortOrder}`,
        source: "part_cover",
      };
    }
    return {
      title: humanizePartChapterTitle(displayTitle),
      source: "part_cover",
    };
  }

  return null;
}

function extractChapterTitleFromScene(scene: SceneTimingRow) {
  const fromOpenerCard = extractSectionOpenerTitle(scene.visualIdea);
  if (fromOpenerCard) {
    return truncateChapterTitle(fromOpenerCard);
  }

  const purpose = scene.visualPurpose?.trim() ?? "";

  // "Open trap one with Emma's promotion as the first ladder step."
  // "Open trap two by framing housing as an adult-status move."
  const trapMatch = purpose.match(
    /^Open\s+trap\s+(\w+)\s+(?:by|with)\s+(.+?)\.?$/i,
  );
  if (trapMatch) {
    const trapLabel = trapMatch[1];
    const topic = trapMatch[2]
      .replace(/^(?:framing|showing)\s+/i, "")
      .replace(/\s+as\s+.+$/i, "")
      .trim();
    const numbered =
      trapLabel.charAt(0).toUpperCase() + trapLabel.slice(1).toLowerCase();
    return truncateChapterTitle(`Trap ${numbered}: ${topic}`);
  }

  // "Opens the section …" / "Open the housing section …"
  const openSectionMatch = purpose.match(
    /^Opens?\s+(?:the\s+)?(?:(.+?)\s+)?section(?:\s+by|\s+with)?\s*(.+)?\.?$/i,
  );
  if (openSectionMatch?.[1] || openSectionMatch?.[2]) {
    const title = [openSectionMatch[1], openSectionMatch[2]]
      .filter(Boolean)
      .join(" — ")
      .trim();
    if (title) {
      return truncateChapterTitle(title);
    }
  }

  if (purpose && !/^close\b/i.test(purpose)) {
    return truncateChapterTitle(purpose);
  }

  // Never use MAIN HOST visualIdea fragments as chapter titles
  const idea = scene.visualIdea?.trim() ?? "";
  if (idea && !/^MAIN HOST:/i.test(idea)) {
    return truncateChapterTitle(idea);
  }

  const scriptLine = firstMeaningfulLine(scene.scriptText);
  if (scriptLine) {
    return truncateChapterTitle(scriptLine);
  }

  return `Scene ${scene.sortOrder}`;
}

export function parseScriptChapters(script: string): ParsedScriptChapter[] {
  const matches = [...script.matchAll(chapterMarkerRegex)];

  if (matches.length === 0) {
    return [];
  }

  return matches.map((match, index) => {
    const start = match.index ?? 0;
    const end =
      index + 1 < matches.length
        ? (matches[index + 1].index ?? script.length)
        : script.length;
    const marker = match[0];
    const title = (match[2] ?? "").trim();
    const body = script.slice(start + marker.length, end).trim();

    return {
      index: Number(match[1]) || index + 1,
      title,
      marker,
      body,
    };
  });
}

function buildSceneTimeline(scenes: SceneTimingRow[]) {
  const overlapAwareDurations = buildOverlapAwareSceneDurations(
    scenes.map((scene) => ({
      sortOrder: scene.sortOrder,
      voiceoverDuration: scene.voiceoverDuration,
      pauseAfterMs: scene.pauseAfterMs,
      isMusicBed:
        scene.voiceoverProvider === MUSIC_BED_PROVIDER || isMusicBedScene(scene),
    })),
  );
  let cursor = 0;

  return scenes.map((scene) => {
    const startSec = cursor;
    const durationSec = sceneRenderDurationSec(scene, overlapAwareDurations);
    cursor += durationSec;

    return {
      ...scene,
      startSec,
      durationSec,
    };
  });
}

function firstMeaningfulLine(text: string) {
  return (
    text
      .split(/\n+/)
      .map((line) => line.trim())
      .find((line) => line.length > 0 && !/^\[CHAPTER/i.test(line)) ?? ""
  );
}

function findChapterStartScene(
  chapter: ParsedScriptChapter,
  timeline: ReturnType<typeof buildSceneTimeline>,
) {
  const target = normalizeTitle(chapter.title);
  const opener = timeline.find((scene) => {
    if (!isSectionOpenerScene(scene)) {
      return false;
    }

    const openerTitle = extractSectionOpenerTitle(scene.visualIdea);
    if (!openerTitle) {
      return false;
    }

    const normalized = normalizeTitle(openerTitle);
    return (
      normalized === target ||
      normalized.includes(target) ||
      target.includes(normalized)
    );
  });

  if (opener) {
    return { scene: opener, source: "section_opener" as const };
  }

  const needle = firstMeaningfulLine(chapter.body).slice(0, 80);
  if (needle) {
    const byScript = timeline.find((scene) =>
      scene.scriptText.replace(/\s+/g, " ").includes(needle.replace(/\s+/g, " ")),
    );

    if (byScript) {
      return { scene: byScript, source: "script_marker" as const };
    }
  }

  return null;
}

export function buildYoutubeChaptersFromScenes({
  script,
  scenes,
  videoTitle,
}: {
  script: string;
  scenes: SceneTimingRow[];
  videoTitle: string;
}) {
  const timeline = buildSceneTimeline(scenes);
  const parsedChapters = parseScriptChapters(script);
  const chapters: YoutubeChapter[] = [];

  if (parsedChapters.length > 0) {
    for (const chapter of parsedChapters) {
      const matched = findChapterStartScene(chapter, timeline);
      const startSec = matched?.scene.startSec ?? 0;

      chapters.push({
        startSec,
        timestamp: formatYoutubeTimestamp(startSec),
        title: chapter.title,
        source: matched?.source ?? "script_marker",
        sceneOrder: matched?.scene.sortOrder ?? null,
      });
    }
  } else {
    const podcastStructureScenes = timeline.filter(isPodcastStructureChapterScene);
    if (podcastStructureScenes.length > 0) {
      for (const scene of podcastStructureScenes) {
        const extracted = extractPodcastStructureChapter(scene);
        if (!extracted) {
          continue;
        }
        chapters.push({
          startSec: scene.startSec,
          timestamp: formatYoutubeTimestamp(scene.startSec),
          title: extracted.title,
          source: extracted.source,
          sceneOrder: scene.sortOrder,
        });
      }
    } else {
      for (const scene of timeline.filter(isSectionOpenerScene)) {
        chapters.push({
          startSec: scene.startSec,
          timestamp: formatYoutubeTimestamp(scene.startSec),
          title: extractChapterTitleFromScene(scene),
          source: "section_opener",
          sceneOrder: scene.sortOrder,
        });
      }
    }
  }

  chapters.sort((a, b) => a.startSec - b.startSec);

  const deduped: YoutubeChapter[] = [];
  for (const chapter of chapters) {
    const previous = deduped[deduped.length - 1];
    if (previous && Math.abs(previous.startSec - chapter.startSec) < 1) {
      continue;
    }
    deduped.push(chapter);
  }

  if (deduped.length > 0 && deduped[0].startSec > 0) {
    deduped.unshift({
      startSec: 0,
      timestamp: "0:00",
      title: "Intro",
      source: "intro",
      sceneOrder: null,
    });
  } else if (deduped.length > 0 && deduped[0].startSec !== 0) {
    deduped[0] = {
      ...deduped[0],
      startSec: 0,
      timestamp: "0:00",
    };
  } else if (deduped.length === 0 && timeline.length > 0) {
    deduped.push({
      startSec: 0,
      timestamp: "0:00",
      title: videoTitle,
      source: "intro",
      sceneOrder: timeline[0]?.sortOrder ?? 1,
    });
  }

  return {
    chapters: deduped,
    timeline,
    parsedChapters,
  };
}

function buildTimedScript({
  script,
  parsedChapters,
  chapters,
}: {
  script: string;
  parsedChapters: ParsedScriptChapter[];
  chapters: YoutubeChapter[];
}) {
  if (parsedChapters.length === 0) {
    return script.trim();
  }

  const chapterByTitle = new Map(
    chapters.map((chapter) => [normalizeTitle(chapter.title), chapter]),
  );

  const parts: string[] = [];
  const preambleEnd = script.search(chapterMarkerRegex);

  if (preambleEnd > 0) {
    const preamble = script.slice(0, preambleEnd).trim();
    if (preamble) {
      parts.push(`[0:00]\n${preamble}`);
    }
  }

  for (const chapter of parsedChapters) {
    const matched =
      chapterByTitle.get(normalizeTitle(chapter.title)) ??
      chapters.find(
        (item) =>
          normalizeTitle(item.title).includes(normalizeTitle(chapter.title)) ||
          normalizeTitle(chapter.title).includes(normalizeTitle(item.title)),
      );
    const timestamp = matched?.timestamp ?? "0:00";
    parts.push(
      `[${timestamp}] ${chapter.marker}\n\n${chapter.body}`.trim(),
    );
  }

  return parts.join("\n\n");
}

export async function getYoutubeChaptersExport(
  videoId: string,
): Promise<YoutubeChaptersExport | null> {
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    include: {
      scenes: {
        orderBy: { sortOrder: "asc" },
        select: {
          sortOrder: true,
          scriptText: true,
          visualPurpose: true,
          visualIdea: true,
          duration: true,
          voiceoverDuration: true,
          pauseAfterMs: true,
          voiceoverProvider: true,
          status: true,
        },
      },
    },
  });

  if (!video) {
    return null;
  }

  const activeScenes = video.scenes.filter(
    (scene) => (scene.status ?? "").trim().toLowerCase() !== "rejected",
  );

  const script = video.script?.trim() || "";
  const { chapters, parsedChapters } = buildYoutubeChaptersFromScenes({
    script,
    scenes: activeScenes,
    videoTitle: video.title,
  });

  const youtubeDescriptionBlock = chapters
    .map((chapter) => `${chapter.timestamp} ${chapter.title}`)
    .join("\n");

  const timedScript = buildTimedScript({
    script,
    parsedChapters,
    chapters,
  });

  const downloadText = [
    video.title,
    "",
    "YouTube chapters",
    "Paste this block into the YouTube description (first timestamp must be 0:00):",
    "",
    youtubeDescriptionBlock || "No chapters detected.",
    "",
    "---",
    "",
    "Timed script with chapter markers",
    "",
    timedScript || "No script available.",
    "",
  ].join("\n");

  return {
    videoId: video.id,
    title: video.title,
    chapters,
    youtubeDescriptionBlock,
    timedScript,
    downloadText,
  };
}
