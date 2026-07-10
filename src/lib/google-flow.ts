import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  appendImageBatchLog,
  generatedImagesDir,
  localImageUrl,
  removePreviousGeneratedImage,
  stableSceneImageFileName,
} from "@/lib/image-batches";
import { prisma } from "@/lib/prisma";

type FlowPage = {
  url: () => string;
  goto: (url: string, options?: Record<string, unknown>) => Promise<unknown>;
  bringToFront: () => Promise<unknown>;
  locator: (selector: string) => {
    count: () => Promise<number>;
    nth: (index: number) => {
      isVisible: (options?: Record<string, unknown>) => Promise<boolean>;
      scrollIntoViewIfNeeded: (options?: Record<string, unknown>) => Promise<unknown>;
      click: (options?: Record<string, unknown>) => Promise<unknown>;
      innerText: (options?: Record<string, unknown>) => Promise<string>;
      inputValue: (options?: Record<string, unknown>) => Promise<string>;
    };
  };
  waitForTimeout: (timeout: number) => Promise<unknown>;
  keyboard: {
    press: (key: string) => Promise<unknown>;
    insertText: (text: string) => Promise<unknown>;
  };
  request: {
    get: (
      url: string,
      options?: Record<string, unknown>,
    ) => Promise<{
      ok: () => boolean;
      status: () => number;
      headers: () => Record<string, string>;
      body: () => Promise<Buffer>;
    }>;
  };
  evaluate: <TArg, TResult>(
    fn: (value: TArg) => TResult | Promise<TResult>,
    value: TArg,
  ) => Promise<TResult>;
};

type FlowBrowserContext = {
  newPage: () => Promise<FlowPage>;
  pages: () => FlowPage[];
};

type FlowBrowser = {
  newPage: () => Promise<FlowPage>;
  contexts?: () => FlowBrowserContext[];
  close: () => Promise<void>;
};

type PlaywrightModule = {
  chromium: {
    connectOverCDP: (endpointURL: string, options?: Record<string, unknown>) => Promise<FlowBrowser>;
    launch: (options: Record<string, unknown>) => Promise<FlowBrowser>;
  };
};

type FlowBrowserSession = {
  browser: FlowBrowser;
  usesExistingChrome: boolean;
};

type BatchPayloadItem = {
  sceneId: string;
  sceneOrder: number;
  fileName?: string;
  imagePrompt: string;
};

type BatchPayload = {
  items?: BatchPayloadItem[];
};

type SceneForFlow = {
  id: string;
  sortOrder: number;
  imagePrompt: string | null;
  imageFileName: string | null;
  imageLocalPath: string | null;
};

type FlowDownloadedPng = {
  base64: string;
  width: number;
  height: number;
  type: string;
  size: number;
};

class GoogleFlowAutomationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleFlowAutomationError";
  }
}

const flowProjectUrl =
  process.env.GOOGLE_FLOW_PROJECT_URL?.trim() ||
  process.env.GOOGLE_FLOW_URL?.trim() ||
  "";
const flowCdpUrl =
  process.env.GOOGLE_FLOW_CDP_URL?.trim() ||
  process.env.GOOGLE_FLOW_CHROME_CDP_URL?.trim() ||
  "http://127.0.0.1:9222";

const flowConfig = {
  url: flowProjectUrl,
  cdpUrl: flowCdpUrl,
  browserChannel: process.env.GOOGLE_FLOW_BROWSER_CHANNEL?.trim() || "chrome",
  promptSelector: process.env.GOOGLE_FLOW_PROMPT_SELECTOR?.trim() || "",
  submitSelector: process.env.GOOGLE_FLOW_SUBMIT_SELECTOR?.trim() || "",
  batchSize: clampInt(process.env.GOOGLE_FLOW_CONCURRENT_BATCH_SIZE, 4, 1, 8),
  submitGapMs: clampInt(process.env.GOOGLE_FLOW_SUBMIT_GAP_MS, 350, 80, 3000),
  responseTimeoutMs:
    clampInt(process.env.GOOGLE_FLOW_RESPONSE_TIMEOUT_SEC, 180, 60, 900) * 1000,
  postReadyMs: clampInt(process.env.GOOGLE_FLOW_POST_READY_MS, 3000, 0, 30000),
  batchClassifyMs:
    clampInt(process.env.GOOGLE_FLOW_BATCH_CLASSIFY_SEC, 180, 30, 900) * 1000,
  minSavedBytes: clampInt(process.env.GOOGLE_FLOW_MIN_FILE_BYTES, 35000, 1, 10000000),
};

const flowGenerateSelectors = [
  "button[aria-label*='Generate' i]",
  "button[aria-label*='Create' i]",
  "button[aria-label*='Generar' i]",
  "button:has-text('Generate')",
  "button:has-text('Generar')",
];

function clampInt(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
) {
  const parsed = Number(value ?? "");

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

async function importPlaywright() {
  const dynamicImport = new Function(
    "specifier",
    "return import(specifier)",
  ) as (specifier: string) => Promise<unknown>;

  return (await dynamicImport("playwright")) as PlaywrightModule;
}

async function checkPlaywrightAvailable() {
  try {
    return await importPlaywright();
  } catch {
    return null;
  }
}

async function loadBatchPayload(payloadPath: string | null) {
  if (!payloadPath) {
    return null;
  }

  try {
    const { readFile } = await import("node:fs/promises");
    return JSON.parse(await readFile(payloadPath, "utf8")) as BatchPayload;
  } catch {
    return null;
  }
}

async function logAutomationConfig(batchId: string) {
  await appendImageBatchLog(
    batchId,
    `GOOGLE_FLOW_PROJECT_URL configured: ${flowConfig.url ? "yes" : "no"}`,
  );
  await appendImageBatchLog(batchId, `GOOGLE_FLOW_CDP_URL: ${flowConfig.cdpUrl}`);
  await appendImageBatchLog(
    batchId,
    `Flow batch defaults: batch_size=${flowConfig.batchSize}, submit_gap_ms=${flowConfig.submitGapMs}, timeout_ms=${flowConfig.responseTimeoutMs}`,
  );
}

async function logChromeCdpVersion(batchId: string) {
  try {
    const response = await fetch(new URL("/json/version", flowConfig.cdpUrl), {
      cache: "no-store",
    });
    const version = (await response.json()) as {
      Browser?: string;
      "User-Agent"?: string;
    };

    await appendImageBatchLog(
      batchId,
      `Chrome CDP version: ${version.Browser ?? "unknown"}`,
    );
    await appendImageBatchLog(
      batchId,
      `Chrome CDP user agent: ${version["User-Agent"] ?? "unknown"}`,
    );
  } catch (error) {
    await appendImageBatchLog(
      batchId,
      `Chrome CDP version check failed: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
  }
}

async function connectToFlowBrowser(
  playwright: PlaywrightModule,
  batchId: string,
): Promise<FlowBrowserSession> {
  await appendImageBatchLog(batchId, "Connecting to existing Chrome session");
  await logChromeCdpVersion(batchId);

  try {
    const browser = await playwright.chromium.connectOverCDP(flowConfig.cdpUrl, {
      timeout: 15000,
    });

    await appendImageBatchLog(batchId, "Connected to existing Chrome via CDP");
    return { browser, usesExistingChrome: true };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown CDP connection error.";

    await appendImageBatchLog(batchId, `CDP connection error: ${errorMessage}`);

    throw new GoogleFlowAutomationError(
      `Could not connect to Chrome remote debugging at ${flowConfig.cdpUrl}. Start Chrome with --remote-debugging-port=9222 and a logged-in Google profile.`,
    );
  }
}

async function launchGoogleFlow(
  playwright: PlaywrightModule,
  batchId: string,
): Promise<FlowBrowserSession> {
  if (flowConfig.cdpUrl) {
    return connectToFlowBrowser(playwright, batchId);
  }

  await appendImageBatchLog(batchId, "Launching fresh Chromium browser");

  try {
    const browser = await playwright.chromium.launch({
      channel: flowConfig.browserChannel,
      headless: false,
    });

    return { browser, usesExistingChrome: false };
  } catch {
    const browser = await playwright.chromium.launch({ headless: false });

    return { browser, usesExistingChrome: false };
  }
}

async function getFlowPage(session: FlowBrowserSession, batchId: string) {
  const contexts = session.usesExistingChrome ? session.browser.contexts?.() ?? [] : [];
  const pages = contexts.flatMap((context) => context.pages());
  const existingFlowPage =
    pages.find((page) => page.url().includes("labs.google/fx")) ?? null;

  if (existingFlowPage) {
    await existingFlowPage.bringToFront();
    await appendImageBatchLog(batchId, "Reusing existing Google Flow tab");
    return existingFlowPage;
  }

  const context = contexts[0] ?? null;
  const page = context ? await context.newPage() : await session.browser.newPage();

  await page.goto(flowConfig.url, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await appendImageBatchLog(batchId, "Google Flow opened");

  return page;
}

async function restoreComposer(page: FlowPage) {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  await page.evaluate<null, unknown>(
    async () => {
      const dismiss = [...document.querySelectorAll<HTMLElement>("button,[role=button]")].find(
        (button) => (button.innerText || "").trim() === "Entendido",
      );

      dismiss?.click();

      for (let index = 0; index < 4; index += 1) {
        const back = [...document.querySelectorAll<HTMLElement>("button,[role=button]")].find(
          (button) => {
            const raw = (button.innerText || "").trim();
            const aria = (button.getAttribute("aria-label") || "").trim();

            return (
              raw === "Atrás" ||
              aria === "Atrás" ||
              aria === "Back" ||
              /^volver/i.test(raw) ||
              /^volver/i.test(aria)
            );
          },
        );

        if (!back) {
          break;
        }

        back.click();
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      window.scrollTo(0, document.body.scrollHeight);
    },
    null,
  );
  await page.waitForTimeout(450);
}

async function insertPrompt(page: FlowPage, prompt: string) {
  const focusResult = await page.evaluate<
    { selector: string },
    { ok: boolean; method: string; diagnostics?: string }
  >(({ selector }) => {
      const allElements = (root: ParentNode): HTMLElement[] => {
        const elements = [...root.querySelectorAll<HTMLElement>("*")];
        const shadowElements = elements.flatMap((element) =>
          element.shadowRoot ? allElements(element.shadowRoot) : [],
        );

        return [...elements, ...shadowElements];
      };
      const isVisible = (element: HTMLElement) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);

        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          rect.width > 40 &&
          rect.height > 12
        );
      };
      const isEditor = (element: HTMLElement) => {
        const tagName = element.tagName.toLowerCase();
        const role = element.getAttribute("role")?.toLowerCase() ?? "";
        const ariaLabel = element.getAttribute("aria-label")?.toLowerCase() ?? "";
        const placeholder =
          element.getAttribute("placeholder")?.toLowerCase() ??
          element.getAttribute("aria-placeholder")?.toLowerCase() ??
          "";
        const className =
          typeof element.className === "string"
            ? element.className.toLowerCase()
            : "";

        return (
          tagName === "textarea" ||
          (tagName === "input" &&
            ["text", "search"].includes(
              (element as HTMLInputElement).type || "text",
            )) ||
          element.isContentEditable ||
          element.getAttribute("contenteditable") === "true" ||
          role === "textbox" ||
          className.includes("prosemirror") ||
          className.includes("ql-editor") ||
          ariaLabel.includes("prompt") ||
          ariaLabel.includes("describe") ||
          ariaLabel.includes("describir") ||
          placeholder.includes("prompt") ||
          placeholder.includes("describe") ||
          placeholder.includes("describir") ||
          placeholder.includes("imagen")
        );
      };
      const selectors = [
        selector,
        "textarea[placeholder*='Describe' i]",
        "textarea[placeholder*='Describ' i]",
        "textarea[placeholder*='imagen' i]",
        "textarea[placeholder*='prompt' i]",
        "input[placeholder*='Describe' i]",
        "input[placeholder*='Describ' i]",
        "input[placeholder*='prompt' i]",
        "div[contenteditable='true'][role='textbox']",
        "div[contenteditable='true']",
        "[role='textbox']",
        ".ProseMirror",
        ".ql-editor",
        "textarea",
      ].filter(Boolean);
      const selectorCandidates = selectors.flatMap((candidateSelector) => {
        try {
          return [...document.querySelectorAll<HTMLElement>(candidateSelector)];
        } catch {
          return [];
        }
      });
      const deepCandidates = allElements(document).filter(isEditor);
      const candidates = [...selectorCandidates, ...deepCandidates];
      const seen = new Set<HTMLElement>();
      const visibleCandidates = candidates.filter((element) => {
          if (seen.has(element)) {
            return false;
          }

          seen.add(element);

          return isVisible(element);
        })
        .sort((a, b) => a.getBoundingClientRect().y - b.getBoundingClientRect().y);
      const target = visibleCandidates[visibleCandidates.length - 1] ?? null;

      if (!target) {
        const visibleText = document.body.innerText
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
          .slice(0, 8)
          .join(" | ");

        return {
          ok: false,
          method: "not found",
          diagnostics: visibleText || document.title || window.location.href,
        };
      }

      target.scrollIntoView({ block: "center", inline: "center" });
      target.click();
      target.focus();

      if (
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLInputElement
      ) {
        target.value = "";
        target.dispatchEvent(new InputEvent("input", { bubbles: true }));
      } else {
        const selection = window.getSelection();
        const range = document.createRange();

        range.selectNodeContents(target);
        selection?.removeAllRanges();
        selection?.addRange(range);
      }

      return {
        ok: true,
        method:
          target.tagName.toLowerCase() +
          (target.getAttribute("role") ? `[role=${target.getAttribute("role")}]` : ""),
      };
    },
    { selector: flowConfig.promptSelector },
  );

  if (!focusResult.ok) {
    throw new Error(
      `Flow prompt input was not found. Visible page text: ${
        focusResult.diagnostics ?? "unavailable"
      }`,
    );
  }

  await page.keyboard.press("Meta+A");
  await page.keyboard.press("Backspace");

  for (let index = 0; index < prompt.length; index += 4000) {
    await page.keyboard.insertText(prompt.slice(index, index + 4000));
  }

  return focusResult.method;
}

function inputStillHoldsPrompt(current: string, prompt: string) {
  const normalizedCurrent = current.replace(/\s+/g, " ").trim();

  if (normalizedCurrent.length < 60) {
    return false;
  }

  const head = prompt.replace(/\s+/g, " ").trim().slice(0, 100);

  return Boolean(head) && normalizedCurrent.includes(head.slice(0, 50));
}

async function readFlowInputText(page: FlowPage) {
  const result = await page.evaluate<
    { selector: string },
    { text: string }
  >(({ selector }) => {
    const selectors = [
      selector,
      "textarea[placeholder*='Describe' i]",
      "textarea[placeholder*='Describ' i]",
      "textarea[placeholder*='imagen' i]",
      "textarea[placeholder*='prompt' i]",
      "input[placeholder*='Describe' i]",
      "input[placeholder*='Describ' i]",
      "input[placeholder*='prompt' i]",
      "div[contenteditable='true'][role='textbox']",
      "div[contenteditable='true']",
      "[role='textbox']",
      ".ProseMirror",
      ".ql-editor",
      "textarea",
    ].filter(Boolean);
    const candidates = selectors.flatMap((candidateSelector) => {
      try {
        return [...document.querySelectorAll<HTMLElement>(candidateSelector)];
      } catch {
        return [];
      }
    });
    const visible = candidates
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);

        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          rect.width > 40 &&
          rect.height > 12
        );
      })
      .sort((a, b) => a.getBoundingClientRect().y - b.getBoundingClientRect().y);
    const target = visible[visible.length - 1] ?? null;

    if (!target) {
      return { text: "" };
    }

    if (
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLInputElement
    ) {
      return { text: target.value || "" };
    }

    return { text: target.innerText || target.textContent || "" };
  }, { selector: flowConfig.promptSelector });

  return result.text.trim();
}

async function snapshotFlowImageSignatures(page: FlowPage) {
  const signatures = await page.evaluate<null, string[]>(() => {
    const out: string[] = [];
    const seen = new Set<string>();

    for (const image of document.querySelectorAll<HTMLImageElement>("img")) {
      const src = image.currentSrc || image.src || "";

      if (!src || src.startsWith("data:image/svg")) {
        continue;
      }

      const lowerSrc = src.toLowerCase();

      if (
        lowerSrc.includes("avatar") ||
        lowerSrc.includes("logo") ||
        lowerSrc.includes("favicon") ||
        lowerSrc.includes("icon") ||
        lowerSrc.includes("emoji")
      ) {
        continue;
      }

      const rect = image.getBoundingClientRect();
      const side = Math.max(rect.width, rect.height, image.naturalWidth, image.naturalHeight);

      if (side < 400) {
        continue;
      }

      const signature = `${src.slice(0, 120)}|${Math.round(rect.width)}x${Math.round(rect.height)}`;

      if (seen.has(signature)) {
        continue;
      }

      seen.add(signature);
      out.push(signature);
    }

    return out;
  }, null);

  return new Set(signatures);
}

async function countNewStableFlowImages({
  page,
  batchId,
  baseline,
  expectedCount,
}: {
  page: FlowPage;
  batchId: string;
  baseline: Set<string>;
  expectedCount: number;
}) {
  const stableHits = new Map<string, number>();
  const confirmed = new Set<string>();
  let lastLogged = -1;
  let lastGalleryRefreshAt = 0;
  const startedAt = Date.now();

  await appendImageBatchLog(
    batchId,
    `Waiting for ${expectedCount} new Flow image(s), baseline=${baseline.size}`,
  );

  while (Date.now() - startedAt < flowConfig.responseTimeoutMs) {
    const elapsed = Date.now() - startedAt;

    if (elapsed - lastGalleryRefreshAt > 5000) {
      await refreshFlowGallery(page);
      lastGalleryRefreshAt = elapsed;
    }

    const current = await snapshotFlowImageSignatures(page);

    for (const signature of current) {
      if (baseline.has(signature) || confirmed.has(signature)) {
        continue;
      }

      const hits = (stableHits.get(signature) ?? 0) + 1;
      stableHits.set(signature, hits);

      if (hits >= 2) {
        confirmed.add(signature);
      }
    }

    if (confirmed.size !== lastLogged) {
      await appendImageBatchLog(
        batchId,
        `Flow render progress: ${confirmed.size}/${expectedCount} image(s) stable`,
      );
      lastLogged = confirmed.size;
    }

    if (confirmed.size >= expectedCount) {
      return confirmed.size;
    }

    await page.waitForTimeout(900);
  }

  return confirmed.size;
}

async function refreshFlowGallery(page: FlowPage) {
  await page.evaluate<null, unknown>(() => {
    window.scrollTo(0, document.body.scrollHeight);
  }, null);
  await page.waitForTimeout(500);
  await page.evaluate<null, unknown>(() => {
    window.scrollTo(0, 0);
  }, null);
  await page.waitForTimeout(300);
}

async function submitPrompt(page: FlowPage) {
  if (flowConfig.submitSelector) {
    try {
      const loc = page.locator(flowConfig.submitSelector);
      const count = await loc.count();

      for (let index = count - 1; index >= 0; index -= 1) {
        const button = loc.nth(index);

        if (await button.isVisible({ timeout: 500 })) {
          await button.scrollIntoViewIfNeeded({ timeout: 2000 });
          await button.click({ timeout: 3000 });
          return "configured selector";
        }
      }
    } catch {
      // Continue with broad button detection.
    }
  }

  for (const selector of flowGenerateSelectors) {
    try {
      const loc = page.locator(selector);
      const count = await loc.count();

      for (let index = count - 1; index >= 0; index -= 1) {
        const button = loc.nth(index);

        if (await button.isVisible({ timeout: 600 })) {
          await button.scrollIntoViewIfNeeded({ timeout: 2000 });
          await button.click({ timeout: 3000 });
          return selector;
        }
      }
    } catch {
      // Try the next selector.
    }
  }

  const clicked = await page.evaluate<null, boolean>(() => {
    const labels = [/^generar$/i, /^generate$/i, /^create$/i];
    const buttons = [...document.querySelectorAll<HTMLElement>("button,[role=button]")];

    for (let index = buttons.length - 1; index >= 0; index -= 1) {
      const button = buttons[index];
      const label = (
        button.innerText ||
        button.getAttribute("aria-label") ||
        button.getAttribute("title") ||
        ""
      ).trim();
      const rect = button.getBoundingClientRect();
      const style = window.getComputedStyle(button);

      if (!labels.some((candidate) => candidate.test(label))) {
        continue;
      }

      if (
        rect.width < 8 ||
        rect.height < 8 ||
        style.display === "none" ||
        style.visibility === "hidden" ||
        Number(style.opacity || "1") < 0.05 ||
        button.hasAttribute("disabled") ||
        button.getAttribute("aria-disabled") === "true"
      ) {
        continue;
      }

      button.scrollIntoView({ block: "center" });
      button.click();
      return true;
    }

    return false;
  }, null);

  if (clicked) {
    return "exact generate/create button";
  }

  await page.keyboard.press("Enter");
  return "enter";
}

async function submitFlowPrompt(page: FlowPage, prompt: string) {
  const text = prompt.trim();
  let lastError = "Flow prompt stayed in the composer after submit.";

  for (let attempt = 0; attempt < 2; attempt += 1) {
    await restoreComposer(page);
    const inputMethod = await insertPrompt(page, text);
    const submitMethod = await submitPrompt(page);

    await page.waitForTimeout(900);

    const current = await readFlowInputText(page);

    if (!inputStillHoldsPrompt(current, text)) {
      return `${inputMethod}, ${submitMethod}`;
    }

    lastError =
      "Flow prompt stayed in the composer after submit; likely wrong button or blocked composer.";
  }

  throw new Error(lastError);
}

async function snapshotFlowMediaIds(page: FlowPage) {
  const ids = await page.evaluate<null, string[]>(() => {
    const mediaIdFromValue = (value: string | null) => {
      if (!value) {
        return "";
      }

      const match = value.match(/name=([a-f0-9-]+)/i);
      return match ? decodeURIComponent(match[1]) : "";
    };
    const out: string[] = [];
    const seen = new Set<string>();

    for (const element of document.querySelectorAll<HTMLElement>(
      'img[alt="Imagen generada"], img[src*="getMediaUrlRedirect"], img[src*="name="], [style*="getMediaUrlRedirect"]',
    )) {
      const style = window.getComputedStyle(element);
      const candidates = [
        element.getAttribute("src"),
        element.getAttribute("href"),
        style.backgroundImage,
      ];
      const id = candidates.map(mediaIdFromValue).find(Boolean) || "";

      if (!id || seen.has(id)) {
        continue;
      }

      seen.add(id);
      out.push(id);
    }

    return out;
  }, null);

  return new Set(ids);
}

async function listNewFlowMediaIds(page: FlowPage, baselineIds: Set<string>) {
  return page.evaluate<string[], string[]>((baselineValues) => {
    const baseline = new Set(baselineValues || []);
    const seen = new Set<string>();
    const out: string[] = [];
    const mediaIdFromValue = (value: string | null) => {
      if (!value) {
        return "";
      }

      const match = value.match(/name=([a-f0-9-]+)/i);
      return match ? decodeURIComponent(match[1]) : "";
    };

    for (const element of document.querySelectorAll<HTMLElement>(
      'img[alt="Imagen generada"], img[src*="getMediaUrlRedirect"], img[src*="name="], [style*="getMediaUrlRedirect"]',
    )) {
      const style = window.getComputedStyle(element);
      const candidates = [
        element.getAttribute("src"),
        element.getAttribute("href"),
        style.backgroundImage,
      ];
      const id = candidates.map(mediaIdFromValue).find(Boolean) || "";

      if (
        !id ||
        baseline.has(id) ||
        seen.has(id)
      ) {
        continue;
      }

      seen.add(id);
      out.push(id);
    }

    return out;
  }, [...baselineIds]);
}

async function waitForNewMediaIds(
  page: FlowPage,
  batchId: string,
  baselineIds: Set<string>,
  expectedCount: number,
) {
  const startedAt = Date.now();
  let stableKey = "";
  let stableHits = 0;
  let latest: string[] = [];

  await appendImageBatchLog(
    batchId,
    `Waiting for ${expectedCount} new Flow media id(s), baseline=${baselineIds.size}`,
  );

  while (Date.now() - startedAt < flowConfig.responseTimeoutMs) {
    const current = await listNewFlowMediaIds(page, baselineIds);
    const ids = current.join("|");

    if (ids && ids === stableKey) {
      stableHits += 1;
    } else {
      stableKey = ids;
      stableHits = 1;
    }

    if (current.length !== latest.length) {
      await appendImageBatchLog(
        batchId,
        `Flow generation progress: ${current.length}/${expectedCount} media id(s) detected`,
      );
    }

    latest = current;

    if (current.length >= expectedCount && stableHits >= 2) {
      return current.slice(0, expectedCount);
    }

    await page.waitForTimeout(900);
  }

  return latest;
}

function assignMediaIdsToBatchScenes(scenes: SceneForFlow[], mediaIds: string[]) {
  const scopedScenes = [...scenes].sort((a, b) => a.sortOrder - b.sortOrder);
  const expectedCount = scopedScenes.length;
  // Flow renders the newest generated image first in the gallery/DOM. When the
  // page exposes extra stale media ids, keep only the newest ids for this scope,
  // then reverse those ids back to prompt submission order.
  const discoveredMedia = [...mediaIds]
    .filter(Boolean)
    .slice(0, expectedCount)
    .reverse();
  const assignments = new Map<string, string>();
  const count = Math.min(scopedScenes.length, discoveredMedia.length);

  for (let index = 0; index < count; index += 1) {
    const scene = scopedScenes[index];
    const mediaItem = discoveredMedia[index];

    if (mediaItem) {
      assignments.set(scene.id, mediaItem);
    }
  }

  return assignments;
}

function assignNewestMediaIdsFirst(scenes: SceneForFlow[], mediaIds: string[]) {
  // Kept only for compatibility. Global newest-first assignment is unsafe for
  // retry batches; all callers should use scoped batch scenes.
  return assignMediaIdsToBatchScenes(scenes, mediaIds);
}

async function downloadFlowMedia(page: FlowPage, mediaId: string) {
  const url = `https://labs.google/fx/api/trpc/media.getMediaUrlRedirect?name=${encodeURIComponent(
    mediaId,
  )}`;
  const response = await page.request.get(url, { timeout: 60000 });

  if (!response.ok()) {
    throw new Error(`Flow media download failed with HTTP ${response.status()}.`);
  }

  const body = await response.body();

  if (body.byteLength < flowConfig.minSavedBytes) {
    throw new Error(
      `Flow media download was too small: ${body.byteLength} bytes.`,
    );
  }

  if (
    body[0] === 0x89 &&
    body[1] === 0x50 &&
    body[2] === 0x4e &&
    body[3] === 0x47
  ) {
    return body;
  }

  const contentType = response.headers()["content-type"] || "image/jpeg";
  const downloadedBase64 = body.toString("base64");
  const png = await page.evaluate<
    { base64: string; contentType: string },
    FlowDownloadedPng
  >(async ({ base64, contentType: mimeType }) => {
    const downloadedBinary = atob(base64);
    const bytes = new Uint8Array(downloadedBinary.length);

    for (let index = 0; index < downloadedBinary.length; index += 1) {
      bytes[index] = downloadedBinary.charCodeAt(index);
    }

    const blob = new Blob([bytes], { type: mimeType || "image/jpeg" });
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Canvas 2D context is unavailable.");
    }

    context.drawImage(bitmap, 0, 0);
    bitmap.close();

    const pngBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((value) => {
        if (value) {
          resolve(value);
        } else {
          reject(new Error("Canvas PNG export failed."));
        }
      }, "image/png");
    });
    const buffer = await pngBlob.arrayBuffer();
    const pngBytes = new Uint8Array(buffer);
    let binary = "";
    const chunkSize = 0x8000;

    for (let index = 0; index < pngBytes.length; index += chunkSize) {
      binary += String.fromCharCode(...pngBytes.slice(index, index + chunkSize));
    }

    return {
      base64: btoa(binary),
      width: canvas.width,
      height: canvas.height,
      type: blob.type,
      size: blob.size,
    };
  }, { base64: downloadedBase64, contentType });

  const pngBytes = Buffer.from(png.base64, "base64");

  if (pngBytes.byteLength < flowConfig.minSavedBytes) {
    throw new Error(
      `Flow PNG conversion was too small: ${pngBytes.byteLength} bytes.`,
    );
  }

  return pngBytes;
}

async function saveGeneratedSceneImage({
  page,
  batchId,
  videoId,
  scene,
  mediaId,
  outputFolder,
}: {
  page: FlowPage;
  batchId: string;
  videoId: string;
  scene: SceneForFlow;
  mediaId: string;
  outputFolder: string;
}) {
  const fileName = stableSceneImageFileName(scene.id);
  const targetPath = path.join(outputFolder, fileName);
  const imageBytes = await downloadFlowMedia(page, mediaId);

  await mkdir(outputFolder, { recursive: true });
  await writeFile(targetPath, imageBytes);
  const removedPreviousImage = await removePreviousGeneratedImage(
    scene.imageLocalPath,
    targetPath,
  );
  await prisma.scene.update({
    where: { id: scene.id },
    data: {
      imageLocalPath: path.relative(process.cwd(), targetPath),
      imageUrl: localImageUrl(videoId, fileName),
      imageStatus: "attached",
      imageError: null,
      imageFileName: fileName,
      status: "asset_ready",
    },
  });
  await appendImageBatchLog(
    batchId,
    `scene ${scene.sortOrder} attached from Flow media ${mediaId}${
      removedPreviousImage ? "; previous generated image removed" : ""
    }`,
  );
}

function buildFlowBatches(scenes: SceneForFlow[], batchSize: number) {
  const orderedScenes = [...scenes].sort((a, b) => a.sortOrder - b.sortOrder);
  const batches: SceneForFlow[][] = [];

  for (let index = 0; index < orderedScenes.length; index += batchSize) {
    batches.push(orderedScenes.slice(index, index + batchSize));
  }

  return batches;
}

export async function processBatchWithGoogleFlow(batchId: string) {
  const batch = await prisma.imageBatch.findUnique({
    where: { id: batchId },
    include: {
      video: {
        include: {
          scenes: {
            where: { imageBatchId: batchId },
            orderBy: { sortOrder: "asc" },
          },
        },
      },
    },
  });

  if (!batch) {
    throw new Error("Batch not found.");
  }

  await appendImageBatchLog(batchId, "Flow batch run requested");
  await logAutomationConfig(batchId);

  if (!flowConfig.url) {
    const message = "GOOGLE_FLOW_PROJECT_URL is not configured.";
    await prisma.imageBatch.update({
      where: { id: batchId },
      data: { status: "failed" },
    });
    await appendImageBatchLog(batchId, message);

    return { ok: false, message };
  }

  const playwright = await checkPlaywrightAvailable();

  if (!playwright) {
    const message =
      "Google Flow automation is not available because Playwright is not installed.";

    await prisma.imageBatch.update({
      where: { id: batchId },
      data: { status: "failed" },
    });
    await appendImageBatchLog(batchId, message);

    return { ok: false, message };
  }

  const payload = await loadBatchPayload(batch.payloadPath);
  const payloadBySceneId = new Map(
    payload?.items?.map((item) => [item.sceneId, item]) ?? [],
  );
  const queuedScenes = batch.video.scenes
    .filter((scene) => scene.imageStatus === "queued" && scene.imagePrompt?.trim())
    .map((scene) => {
      const payloadItem = payloadBySceneId.get(scene.id);

      return {
        id: scene.id,
        sortOrder: scene.sortOrder,
        imagePrompt: payloadItem?.imagePrompt || scene.imagePrompt,
        imageFileName: payloadItem?.fileName || scene.imageFileName,
        imageLocalPath: scene.imageLocalPath,
      };
    });

  if (queuedScenes.length === 0) {
    const message = "No queued scene with an image prompt was found for this batch.";
    await prisma.imageBatch.update({
      where: { id: batchId },
      data: { status: "idle" },
    });
    await appendImageBatchLog(batchId, message);

    return { ok: false, message };
  }

  const batchSize = Math.min(Math.max(batch.parallelCount || flowConfig.batchSize, 1), 8);
  const batches = buildFlowBatches(queuedScenes, batchSize);

  await prisma.imageBatch.update({
    where: { id: batchId },
    data: { status: "running" },
  });
  await appendImageBatchLog(
    batchId,
    `queued ${queuedScenes.length} scenes in ${batches.length} Flow batch(es), size ${batchSize}`,
  );

  try {
    const session = await launchGoogleFlow(playwright, batchId);
    const page = await getFlowPage(session, batchId);
    const outputFolder =
      batch.outputFolder || generatedImagesDir(batch.videoId, batch.video.title);
    let attached = 0;
    let failed = 0;
    const runUsedMediaIds = new Set<string>();

    await refreshFlowGallery(page);

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
      const sceneBatch = batches[batchIndex];

      await appendImageBatchLog(
        batchId,
        `Flow batch ${batchIndex + 1}/${batches.length}: submitting ${sceneBatch.length} prompt(s)`,
      );

      for (const scene of sceneBatch) {
        await prisma.scene.update({
          where: { id: scene.id },
          data: { imageStatus: "generating", imageError: null },
        });
        const method = await submitFlowPrompt(page, scene.imagePrompt ?? "");

        await appendImageBatchLog(
          batchId,
          `scene ${scene.sortOrder} submitted via ${method}`,
        );
        await page.waitForTimeout(flowConfig.submitGapMs);
      }

      // Snapshot after all prompts are submitted so gallery images visible during
      // submission are excluded from the "new media" set for this sub-batch.
      await page.waitForTimeout(flowConfig.postReadyMs);
      await refreshFlowGallery(page);
      const baselineIds = await snapshotFlowMediaIds(page);
      const baselineImageSignatures = await snapshotFlowImageSignatures(page);

      const readyCount = await countNewStableFlowImages({
        page,
        batchId,
        baseline: baselineImageSignatures,
        expectedCount: sceneBatch.length,
      });

      if (readyCount < sceneBatch.length) {
        const message = `Flow batch ${batchIndex + 1} incomplete: expected ${sceneBatch.length} stable new image(s), found ${readyCount}.`;

        await appendImageBatchLog(batchId, message);
      }

      await refreshFlowGallery(page);

      const savedSceneIds = new Set<string>();
      const classifyStartedAt = Date.now();
      let classifyAttempt = 0;

      while (
        savedSceneIds.size < sceneBatch.length &&
        Date.now() - classifyStartedAt < flowConfig.batchClassifyMs
      ) {
        classifyAttempt += 1;
        const pendingScenes = sceneBatch.filter((scene) => !savedSceneIds.has(scene.id));

        await appendImageBatchLog(
          batchId,
          `Classifying Flow batch ${batchIndex + 1}, attempt ${classifyAttempt}: ${savedSceneIds.size}/${sceneBatch.length} saved`,
        );

        const newMediaIds = (await listNewFlowMediaIds(page, baselineIds)).filter(
          (mediaId) => !runUsedMediaIds.has(mediaId),
        );

        if (newMediaIds.length < pendingScenes.length) {
          await appendImageBatchLog(
            batchId,
            `Flow batch ${batchIndex + 1}: waiting for media ids (${newMediaIds.length}/${pendingScenes.length} ready).`,
          );
          await page.waitForTimeout(3500);
          await refreshFlowGallery(page);
          continue;
        }

        if (
          newMediaIds.length > pendingScenes.length &&
          classifyAttempt < 4 &&
          Date.now() - classifyStartedAt < flowConfig.batchClassifyMs - 5000
        ) {
          await appendImageBatchLog(
            batchId,
            `Flow batch ${batchIndex + 1}: ${newMediaIds.length} new media id(s) for ${pendingScenes.length} scene(s); waiting for gallery to settle.`,
          );
          await page.waitForTimeout(3500);
          await refreshFlowGallery(page);
          continue;
        }

        const assignments = assignMediaIdsToBatchScenes(pendingScenes, newMediaIds);

        if (assignments.size > 0) {
          await appendImageBatchLog(
            batchId,
            `Google Flow batch assignment: batch ${batchId} expected ${pendingScenes.length} found ${newMediaIds.length}; ${pendingScenes
              .map((scene) => {
                const mediaId = assignments.get(scene.id);

                return mediaId
                  ? `scene ${scene.sortOrder.toString().padStart(3, "0")} -> media ${mediaId.slice(0, 8)} -> ${stableSceneImageFileName(scene.id)}`
                  : `scene ${scene.sortOrder.toString().padStart(3, "0")} -> missing -> needs_retry`;
              })
              .join(", ")}`,
          );
        }

        if (newMediaIds.length > pendingScenes.length) {
          await appendImageBatchLog(
            batchId,
            `Google Flow returned ${newMediaIds.length} new media id(s) for ${pendingScenes.length} pending scene(s); using newest ${pendingScenes.length}, older extras ignored.`,
          );
        }

        for (const scene of pendingScenes) {
          const mediaId = assignments.get(scene.id);

          if (!mediaId) {
            continue;
          }

          try {
            await saveGeneratedSceneImage({
              page,
              batchId,
              videoId: batch.videoId,
              scene,
              mediaId,
              outputFolder,
            });
            runUsedMediaIds.add(mediaId);
            savedSceneIds.add(scene.id);
            attached += 1;
          } catch (error) {
            const message =
              error instanceof Error
                ? `Scene ${scene.sortOrder} download failed: ${error.message}`
                : `Scene ${scene.sortOrder} download failed.`;

            await appendImageBatchLog(batchId, message);
          }
        }

        if (savedSceneIds.size >= sceneBatch.length) {
          break;
        }

        await page.waitForTimeout(3500);
        await refreshFlowGallery(page);
      }

      for (const scene of sceneBatch) {
        if (savedSceneIds.has(scene.id)) {
          continue;
        }

        const message = "No generated image was attached for this scene.";

        failed += 1;
        await prisma.scene.update({
          where: { id: scene.id },
          data: { imageStatus: "needs_retry", imageError: message },
        });
        await appendImageBatchLog(
          batchId,
          `scene ${scene.sortOrder.toString().padStart(3, "0")} -> missing -> needs_retry`,
        );
      }
    }

    await prisma.imageBatch.update({
      where: { id: batchId },
      data: {
        status:
          attached > 0 && failed === 0
            ? "imported"
            : attached > 0
              ? "partial"
              : "failed",
      },
    });
    await appendImageBatchLog(
      batchId,
      `Flow run finished: ${attached} attached, ${failed} failed`,
    );

    return {
      ok: attached > 0 && failed === 0,
      message: `Flow run finished: ${attached} attached, ${failed} failed.`,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? `Google Flow automation failed: ${error.message}`
        : "Google Flow automation failed.";

    await prisma.scene.updateMany({
      where: { id: { in: queuedScenes.map((scene) => scene.id) } },
      data: { imageStatus: "waiting_manual", imageError: message },
    });
    await prisma.imageBatch.update({
      where: { id: batchId },
      data: { status: "waiting_manual" },
    });
    await appendImageBatchLog(batchId, message);

    return { ok: false, message };
  }
}

export async function runGoogleFlowBatch(batchId: string) {
  return processBatchWithGoogleFlow(batchId);
}

export async function generateThumbnailWithGoogleFlow({
  videoId,
  prompt,
  fileName = "thumbnail.png",
}: {
  videoId: string;
  prompt: string;
  fileName?: string;
}) {
  const cleanPrompt = prompt.trim();
  const safeFileName = path.basename(fileName) || "thumbnail.png";
  const automationId = `thumbnail-${videoId}-${Date.now()}`;

  if (!cleanPrompt) {
    throw new Error("Thumbnail prompt is required before generating with Flow.");
  }

  if (!flowConfig.url) {
    throw new Error("GOOGLE_FLOW_PROJECT_URL is not configured.");
  }

  const playwright = await checkPlaywrightAvailable();

  if (!playwright) {
    throw new Error("Google Flow automation is not available because Playwright is not installed.");
  }

  const session = await launchGoogleFlow(playwright, automationId);

  try {
    const page = await getFlowPage(session, automationId);
    const baselineIds = await snapshotFlowMediaIds(page);
    await submitFlowPrompt(page, cleanPrompt);
    const mediaIds = await waitForNewMediaIds(page, automationId, baselineIds, 1);
    const mediaId = mediaIds[0];

    if (!mediaId) {
      throw new Error("Google Flow did not return a generated thumbnail image.");
    }

    const imageBytes = await downloadFlowMedia(page, mediaId);
    const outputFolder = path.join(process.cwd(), "storage", "thumbnails", videoId);
    const targetPath = path.join(outputFolder, safeFileName);

    await mkdir(outputFolder, { recursive: true });
    await writeFile(targetPath, imageBytes);

    return {
      fileName: safeFileName,
      localPath: path.relative(process.cwd(), targetPath),
      imageUrl: `/api/thumbnails/${encodeURIComponent(videoId)}/${encodeURIComponent(
        safeFileName,
      )}`,
      mediaId,
      sizeBytes: imageBytes.byteLength,
    };
  } finally {
    if (!session.usesExistingChrome) {
      await session.browser.close();
    }
  }
}
