/**
 * Salvage an already-generated Script Writer reply from the open ChatGPT tab.
 * Does NOT re-send prompts. Diagnoses Copy-turn + DOM capture, then saves to Video.script.
 *
 *   npx tsx scripts/salvage-podcast-script-from-chatgpt.ts [videoId]
 */
import { config as loadEnv } from "dotenv";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

import { extractScriptFromResponse } from "../src/lib/script-writer-extract";
import {
  formatPodcastValidationReport,
  validatePodcastEnglishScript,
} from "../src/lib/podcast-english-lessons-script-validate";
import { resolvePodcastEpisodeFormat } from "../src/lib/podcast-english-lessons-script-shared";
import { prisma } from "../src/lib/prisma";
import { preferCopiedAssistantText } from "../src/lib/chatgpt-reply-expect";
import { looksLikeNarrationScript } from "../src/lib/script-writer-extract";

const COPY_SELECTORS = [
  '[data-testid="copy-turn-action-button"]',
  'button[aria-label="Copiar respuesta"]',
  'button[aria-label="Copy response"]',
  'button[aria-label="Copy"]',
];

async function main() {
  const videoId = process.argv[2]?.trim() || "cmsnv103u0235nuze1k7uhxc9";
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: {
      id: true,
      title: true,
      topic: true,
      topicCategory: true,
      ideaJson: true,
      script: true,
      channelKey: true,
    },
  });
  if (!video) {
    throw new Error(`Video not found: ${videoId}`);
  }

  console.info("[salvage-script] video", {
    id: video.id,
    title: video.title,
    existingScriptLen: video.script?.length ?? 0,
  });

  const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
  const context = browser.contexts()[0];
  if (!context) {
    throw new Error("No browser context on CDP");
  }

  try {
    await context.grantPermissions(["clipboard-read", "clipboard-write"], {
      origin: "https://chatgpt.com",
    });
  } catch (error) {
    console.warn("[salvage-script] clipboard grant failed", error);
  }

  const pages = context.pages();
  const page =
    pages.find((p) => p.url().includes("chatgpt.com")) ?? pages[0] ?? null;
  if (!page) {
    throw new Error("No ChatGPT page open in CDP Chrome");
  }

  console.info("[salvage-script] page", { url: page.url() });

  const diagnosis = await page.evaluate((selectors) => {
    const assistants = Array.from(
      document.querySelectorAll('[data-message-author-role="assistant"]'),
    ) as HTMLElement[];
    const copyButtons = selectors.flatMap((sel) =>
      Array.from(document.querySelectorAll(sel)),
    );

    const assistantSummaries = assistants.map((node, index) => {
      const markdown = node.querySelector(
        '.markdown, .prose, [class*="markdown"]',
      ) as HTMLElement | null;
      const text = (
        markdown?.innerText ||
        node.innerText ||
        node.textContent ||
        ""
      ).trim();
      let root: HTMLElement | null = node;
      let nearbyCopy = false;
      for (let d = 0; d < 8 && root; d += 1) {
        if (
          selectors.some((sel) => Boolean(root?.querySelector(sel)))
        ) {
          nearbyCopy = true;
          break;
        }
        root = root.parentElement;
      }
      return {
        index,
        chars: text.length,
        hasIntro: /\[INTRO\]/i.test(text),
        hasMax: /\[MAX\]/i.test(text),
        hasSara: /\[SARA\]/i.test(text),
        hasFinal: /\[FINAL\]/i.test(text),
        nearbyCopy,
        head: text.slice(0, 120),
        tail: text.slice(-120),
      };
    });

    return {
      assistantCount: assistants.length,
      copyButtonCount: copyButtons.length,
      assistantSummaries,
    };
  }, COPY_SELECTORS);

  console.info("[salvage-script] diagnosis", JSON.stringify(diagnosis, null, 2));

  // Prefer the longest assistant bubble that looks like a podcast script.
  const bestIndex =
    diagnosis.assistantSummaries
      .filter((a) => a.hasIntro || (a.hasMax && a.hasSara))
      .sort((a, b) => b.chars - a.chars)[0]?.index ??
    diagnosis.assistantSummaries.sort((a, b) => b.chars - a.chars)[0]?.index ??
    -1;

  console.info("[salvage-script] bestAssistantIndex", bestIndex);

  const domText = await page.evaluate(
    ({ selectors, bestIndex: index }) => {
      const assistants = Array.from(
        document.querySelectorAll('[data-message-author-role="assistant"]'),
      ) as HTMLElement[];
      const target =
        (index >= 0 ? assistants[index] : null) ??
        assistants[assistants.length - 1];
      if (!target) {
        return "";
      }
      const markdown = target.querySelector(
        '.markdown, .prose, [class*="markdown"]',
      ) as HTMLElement | null;
      return (
        markdown?.innerText ||
        target.innerText ||
        target.textContent ||
        ""
      ).trim();
    },
    { selectors: COPY_SELECTORS, bestIndex },
  );

  console.info("[salvage-script] domText", {
    chars: domText.length,
    looksLikeScript: looksLikeNarrationScript(domText),
    head: domText.slice(0, 180),
    tail: domText.slice(-180),
  });

  let clipboardBefore = "";
  try {
    clipboardBefore = await page.evaluate(async () => {
      try {
        return await navigator.clipboard.readText();
      } catch (error) {
        return `<<clipboard-read-error:${String(error)}>>`;
      }
    });
  } catch (error) {
    clipboardBefore = `<<evaluate-error:${String(error)}>>`;
  }
  console.info("[salvage-script] clipboardBefore", {
    chars: clipboardBefore.length,
    preview: clipboardBefore.slice(0, 120),
  });

  const clickResult = await page.evaluate(
    ({ selectors, bestIndex: index }) => {
      const assistants = Array.from(
        document.querySelectorAll('[data-message-author-role="assistant"]'),
      );
      const target =
        (index >= 0 ? assistants[index] : null) ||
        assistants[assistants.length - 1];
      if (!target) {
        return { clicked: false, reason: "no-assistant" };
      }

      let button = null;
      let root = target;
      for (let depth = 0; depth < 8 && root && !button; depth += 1) {
        for (let s = 0; s < selectors.length; s += 1) {
          const found = root.querySelector(selectors[s]);
          if (found) {
            button = found;
            break;
          }
        }
        root = root.parentElement;
      }
      if (!button) {
        for (let s = 0; s < selectors.length; s += 1) {
          const nodes = document.querySelectorAll(selectors[s]);
          const last = nodes[nodes.length - 1];
          if (last) {
            button = last;
            break;
          }
        }
      }
      if (!button) {
        return { clicked: false, reason: "no-copy-button" };
      }
      button.scrollIntoView({ block: "nearest" });
      button.click();
      return {
        clicked: true,
        reason: "ok",
        ariaLabel: button.getAttribute("aria-label"),
        testId: button.getAttribute("data-testid"),
      };
    },
    { selectors: COPY_SELECTORS, bestIndex },
  );

  console.info("[salvage-script] copyClick", clickResult);

  let clipboardAfter = "";
  for (let i = 0; i < 20; i += 1) {
    await page.waitForTimeout(150);
    try {
      clipboardAfter = await page.evaluate(async () => {
        try {
          return await navigator.clipboard.readText();
        } catch (error) {
          return `<<clipboard-read-error:${String(error)}>>`;
        }
      });
    } catch (error) {
      clipboardAfter = `<<evaluate-error:${String(error)}>>`;
    }
    if (
      clipboardAfter &&
      !clipboardAfter.startsWith("<<") &&
      clipboardAfter !== clipboardBefore
    ) {
      break;
    }
  }

  console.info("[salvage-script] clipboardAfter", {
    chars: clipboardAfter.length,
    changed: clipboardAfter !== clipboardBefore,
    isError: clipboardAfter.startsWith("<<"),
    preview: clipboardAfter.slice(0, 180),
    looksLikeScript: looksLikeNarrationScript(clipboardAfter),
  });

  const copiedClean =
    clipboardAfter.startsWith("<<") || !clipboardAfter.trim()
      ? ""
      : clipboardAfter.trim();

  const preferred = preferCopiedAssistantText({
    domText,
    copiedText: copiedClean,
    expectReplyKind: "script",
    isNarrationScript: looksLikeNarrationScript,
  });

  console.info("[salvage-script] preferredSource", {
    preferredLen: preferred.length,
    usedClipboard:
      Boolean(copiedClean) && preferred === copiedClean,
    usedDom: preferred === domText.trim(),
  });

  if (!preferred || preferred.length < 40) {
    throw new Error(
      "Could not capture a script from ChatGPT (DOM and clipboard both empty/weak).",
    );
  }

  const script = extractScriptFromResponse(preferred);
  const format = resolvePodcastEpisodeFormat({
    channelKey: video.channelKey,
    ideaJson: video.ideaJson,
    title: video.title,
    topic: video.topic,
    topicEngine: "conversational_podcast",
  });
  const validation = validatePodcastEnglishScript(script, format);

  console.info("[salvage-script] extracted", {
    scriptLen: script.length,
    format,
    validationOk: validation.ok,
    spokenWords: validation.metrics.spokenWordCount,
    parts: validation.metrics.partCount,
  });
  console.info(formatPodcastValidationReport(validation));

  const outDir = path.join(process.cwd(), "storage", "script-writer-salvage");
  await mkdir(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const rawPath = path.join(outDir, `${videoId}-${stamp}-raw.txt`);
  const scriptPath = path.join(outDir, `${videoId}-${stamp}-script.txt`);
  await writeFile(rawPath, preferred, "utf8");
  await writeFile(scriptPath, validation.normalizedScript || script, "utf8");
  console.info("[salvage-script] wrote", { rawPath, scriptPath });

  const toSave = validation.normalizedScript || script;
  await prisma.video.update({
    where: { id: videoId },
    data: { script: toSave },
  });
  console.info("[salvage-script] SAVED to video.script", {
    videoId,
    chars: toSave.length,
  });

  await prisma.$disconnect();
  // Disconnect Playwright CDP client without closing the user's Chrome.
  await browser.close().catch(() => undefined);
}

main().catch(async (error) => {
  console.error("[salvage-script] FAILED", error);
  try {
    await prisma.$disconnect();
  } catch {
    // ignore
  }
  process.exit(1);
});
