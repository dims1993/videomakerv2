import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  parseTopicBatchJson,
  type NormalizedTopicBatchItem,
} from "@/lib/topic-batch-import";

function draftPath(channelKey: string) {
  return path.join(
    process.cwd(),
    "storage",
    "topic-batch-drafts",
    `${channelKey}.json`,
  );
}

export async function saveTopicBatchDraft({
  channelKey,
  rawText,
  error,
}: {
  channelKey: string;
  rawText: string;
  error?: string | null;
}) {
  const filePath = draftPath(channelKey);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(
    filePath,
    JSON.stringify(
      {
        channelKey,
        rawText,
        error: error ?? null,
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
    "utf8",
  );
}

export async function readTopicBatchDraft(channelKey: string) {
  try {
    const raw = await readFile(draftPath(channelKey), "utf8");
    const parsed = JSON.parse(raw) as {
      rawText?: unknown;
      error?: unknown;
      updatedAt?: unknown;
    };

    if (typeof parsed.rawText !== "string" || !parsed.rawText.trim()) {
      return null;
    }

    return {
      rawText: parsed.rawText,
      error: typeof parsed.error === "string" ? parsed.error : null,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : null,
    };
  } catch {
    return null;
  }
}

function matchingJsonEnd(text: string, startIndex: number) {
  const openingCharacter = text[startIndex];
  const closingCharacter = openingCharacter === "[" ? "]" : "}";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = startIndex; index < text.length; index += 1) {
    const character = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }

    if (character === '"') {
      inString = true;
      continue;
    }

    if (character === openingCharacter) {
      depth += 1;
    } else if (character === closingCharacter) {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function repairCommonJsonIssues(text: string) {
  return text
    .replace(/^\uFEFF/, "")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/,\s*([}\]])/g, "$1");
}

/**
 * ChatGPT often writes thumbnail on-image text with raw quotes:
 * "thumbnailIdea": "... text: "WHY IT NEVER GREW""
 * Escape inner quotes that are not real string terminators.
 */
export function repairUnescapedQuotesInStrings(text: string) {
  let result = "";
  let inString = false;
  let index = 0;

  while (index < text.length) {
    const character = text[index];

    if (!inString) {
      result += character;
      if (character === '"') {
        inString = true;
      }
      index += 1;
      continue;
    }

    if (character === "\\" && index + 1 < text.length) {
      result += character + text[index + 1];
      index += 2;
      continue;
    }

    if (character === '"') {
      const after = text.slice(index + 1);
      const isTerminator =
        /^\s*[,:}\]]/.test(after) ||
        /^\s*$/.test(after) ||
        /^\s*\n\s*"/.test(after);

      if (isTerminator) {
        inString = false;
        result += character;
      } else {
        result += '\\"';
      }
      index += 1;
      continue;
    }

    result += character;
    index += 1;
  }

  return result;
}

function prepareJsonCandidate(text: string) {
  return repairUnescapedQuotesInStrings(repairCommonJsonIssues(text));
}

function tryParseTopics(candidate: string): NormalizedTopicBatchItem[] | null {
  const attempts = [candidate, prepareJsonCandidate(candidate)];

  for (const attempt of attempts) {
    try {
      return parseTopicBatchJson(attempt);
    } catch {
      // keep trying
    }
  }

  return null;
}

/**
 * Extract a topic-batch payload from ChatGPT text that may include prose,
 * fences, smart quotes, trailing commas, or unescaped quotes in string values.
 */
export function extractTopicBatchFromResponse(rawResponse: string): {
  topics: NormalizedTopicBatchItem[];
  jsonText: string;
} {
  const text = rawResponse.trim();
  if (!text) {
    throw new Error("ChatGPT returned an empty topic batch response.");
  }

  const fencedBlocks = [
    ...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi),
  ].map((match) => match[1]?.trim() ?? "");

  const candidates: string[] = [];
  for (const block of fencedBlocks) {
    if (block) {
      candidates.push(block);
    }
  }
  candidates.push(text);
  // Prefer repaired plain-text JSON blocks (ChatGPT often returns JSON without fences).
  candidates.push(prepareJsonCandidate(text));

  for (const candidateSource of candidates) {
    const direct = tryParseTopics(candidateSource);
    if (direct) {
      return {
        topics: direct,
        jsonText: JSON.stringify({ topics: direct }, null, 2),
      };
    }

    const repairedSource = prepareJsonCandidate(candidateSource);

    for (const source of [repairedSource, candidateSource]) {
      for (let index = 0; index < source.length; index += 1) {
        if (source[index] !== "{") {
          continue;
        }

        const endIndex = matchingJsonEnd(source, index);
        if (endIndex === -1) {
          continue;
        }

        const slice = source.slice(index, endIndex + 1);
        if (!/"topics"\s*:/.test(slice)) {
          continue;
        }

        const parsed = tryParseTopics(slice);
        if (parsed) {
          return {
            topics: parsed,
            jsonText: JSON.stringify({ topics: parsed }, null, 2),
          };
        }
      }
    }
  }

  throw new Error(
    'Could not parse a valid {"topics":[...]} JSON from the ChatGPT response. The raw response was saved in Import Topic Batch so you can fix and import it manually.',
  );
}
