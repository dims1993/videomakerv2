import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  BrowserAutomationError,
  BrowserRateLimitError,
  BrowserSelectorNotFoundError,
  BrowserSessionExpiredError,
} from "@/lib/browser-automation/errors";
import type {
  BrowserCompletionResult,
  BrowserExpectReplyKind,
  BrowserModelProvider,
  BrowserSessionCheck,
  BrowserSessionContext,
  BrowserSubmissionResult,
  ExtractedModelResponse,
} from "@/lib/browser-automation/types";
import { extractJsonPayload, extractScoreJsonObject } from "@/lib/browser-automation/types";
import {
  preferCopiedAssistantText,
  shouldAcceptAsScoreReply,
  shouldFailFastMissingAssistantBubble,
  shouldKeepWaitingDespiteScoreLikeText,
  shouldTreatAsNewAssistantContent,
} from "@/lib/chatgpt-reply-expect";
import { looksLikeScriptScoreResponse, extractEmbeddedScoreJson } from "@/lib/script-writer-critique";
import { looksLikeNarrationScript } from "@/lib/script-writer-extract";

type PlaywrightModule = {
  chromium: {
    connectOverCDP: (
      endpointURL: string,
      options?: { timeout?: number },
    ) => Promise<PlaywrightBrowser>;
    launchPersistentContext: (
      userDataDir: string,
      options?: Record<string, unknown>,
    ) => Promise<PlaywrightBrowserContext>;
  };
};

type PlaywrightPage = {
  url: () => string;
  goto: (
    url: string,
    options?: { waitUntil?: string; timeout?: number },
  ) => Promise<unknown>;
  bringToFront?: () => Promise<void>;
  waitForSelector: (
    selector: string,
    options?: { timeout?: number; state?: string },
  ) => Promise<unknown>;
  waitForTimeout: (ms: number) => Promise<void>;
  locator: (selector: string) => {
    count: () => Promise<number>;
    first: () => {
      click: (options?: { timeout?: number }) => Promise<void>;
      hover?: (options?: { timeout?: number }) => Promise<void>;
      isDisabled?: () => Promise<boolean>;
      evaluate?: <R>(fn: (el: Element) => R) => Promise<R>;
      setInputFiles?: (files: string | string[]) => Promise<void>;
    };
    last: () => {
      click?: (options?: { timeout?: number }) => Promise<void>;
      hover?: (options?: { timeout?: number }) => Promise<void>;
      innerText: () => Promise<string>;
    };
    setInputFiles?: (files: string | string[]) => Promise<void>;
  };
  evaluate: {
    <R>(fn: () => R): Promise<R>;
    <T, R>(fn: (arg: T) => R, arg: T): Promise<R>;
  };
  keyboard: {
    press: (key: string) => Promise<void>;
    insertText?: (text: string) => Promise<void>;
  };
  context: () => {
    grantPermissions?: (
      permissions: string[],
      options?: { origin?: string },
    ) => Promise<void>;
  };
  close?: () => Promise<void>;
};

type PlaywrightBrowserContext = {
  pages: () => PlaywrightPage[];
  newPage: () => Promise<PlaywrightPage>;
  close?: () => Promise<void>;
};

type PlaywrightBrowser = {
  contexts: () => PlaywrightBrowserContext[];
  newPage?: () => Promise<PlaywrightPage>;
  close?: () => Promise<void>;
};

type PendingSubmission = {
  conversationId: string;
  submittedAt: string;
  assistantBaselineCount: number;
  /** Last assistant bubble text snapshot taken just before Send. */
  assistantBaselineText?: string;
  expectReplyKind: BrowserExpectReplyKind;
  /** Score JSON captured when wait stabilized — used if DOM loses it before extract. */
  capturedScoreJson?: string | null;
  /** Full assistant text captured via Copy-turn clipboard when wait stabilized. */
  capturedAssistantText?: string | null;
};

const CHATGPT_URL =
  process.env.CHATGPT_URL?.trim() || "https://chatgpt.com/";

const DEFAULT_CDP_URL =
  process.env.CHATGPT_CDP_URL?.trim() ||
  process.env.GOOGLE_FLOW_CDP_URL?.trim() ||
  process.env.GOOGLE_FLOW_CHROME_CDP_URL?.trim() ||
  "http://127.0.0.1:9222";

/** Preferred ChatGPT model family shown in the composer picker. */
const PREFERRED_CHATGPT_MODEL =
  process.env.CHATGPT_MODEL?.trim() || "GPT-5.5";

/**
 * Preferred reasoning / intelligence effort.
 * Spanish UI: Alta | Media | Instantánea
 * English UI: High | Medium | Instant
 */
const PREFERRED_CHATGPT_REASONING =
  process.env.CHATGPT_REASONING?.trim() ||
  process.env.CHATGPT_EFFORT?.trim() ||
  "Alta";

function reasoningEffortAliases(preferred: string): string[] {
  const normalized = preferred.trim().toLowerCase();
  if (["alta", "high"].includes(normalized)) {
    return ["Alta", "High"];
  }
  if (["media", "medium"].includes(normalized)) {
    return ["Media", "Medium"];
  }
  if (["instantánea", "instantanea", "instant", "low", "baja"].includes(normalized)) {
    return ["Instantánea", "Instant", "Instantánea 5.5"];
  }
  return [preferred, preferred.replace(/^\w/, (c) => c.toUpperCase())];
}

/**
 * Full scenes JSON (has scriptText) OR hybrid visual-fill patches
 * (order + visualIdea + imagePrompt/sceneType, no scriptText).
 */
function looksLikeVisualPlanJson(text: string): boolean {
  const hasSceneOrImage =
    /"sceneType"\s*:/.test(text) || /"imagePrompt"\s*:/.test(text);
  if (!hasSceneOrImage) {
    return false;
  }
  if (/"scriptText"\s*:/.test(text)) {
    return true;
  }
  return /"order"\s*:/.test(text) && /"visualIdea"\s*:/.test(text);
}

function visualPlanJsonLooksClosed(text: string): boolean {
  const trimmed = text.trimEnd();
  return (
    trimmed.endsWith("]") ||
    trimmed.endsWith("```") ||
    /\]\s*```?\s*$/.test(trimmed)
  );
}

const PROMPT_SELECTORS = [
  "#prompt-textarea",
  '[data-testid="prompt-textarea"]',
  'div[contenteditable="true"][id="prompt-textarea"]',
  'div[contenteditable="true"][role="textbox"]',
  "main div[contenteditable='true']",
];

const SEND_SELECTORS = [
  'button[data-testid="send-button"]',
  'button[aria-label="Send prompt"]',
  'button[aria-label*="Send"]',
];

const STOP_SELECTORS = [
  'button[data-testid="stop-button"]',
  'button[aria-label="Stop generating"]',
  'button[aria-label="Stop streaming"]',
  'button[aria-label*="Stop generating"]',
  'button[aria-label*="Stop streaming"]',
  'button[aria-label*="Detener la generaci"]',
  'button[aria-label*="Detener generación"]',
];

const ASSISTANT_SELECTOR =
  '[data-message-author-role="assistant"], [data-testid="assistant-message"]';

const COPY_TURN_BUTTON_SELECTORS = [
  '[data-testid="copy-turn-action-button"]',
  'button[aria-label="Copiar respuesta"]',
  'button[aria-label="Copy response"]',
  'button[aria-label="Copy"]',
] as const;
const USER_SELECTOR =
  '[data-message-author-role="user"], [data-testid="user-message"]';

function canonicalizeScorePayload(
  scoreJson: string | null,
): { score: number; canonical: string } | null {
  if (!scoreJson) {
    return null;
  }

  try {
    const parsed = JSON.parse(scoreJson) as {
      score?: unknown;
      briefReason?: unknown;
      reason?: unknown;
      topFixes?: unknown;
      fixes?: unknown;
      blockScores?: unknown;
    };
    const raw = parsed.score;
    const numeric =
      typeof raw === "number"
        ? raw
        : typeof raw === "string"
          ? Number(raw.trim().replace(",", "."))
          : NaN;
    if (!Number.isFinite(numeric) || numeric < 0 || numeric > 10) {
      return null;
    }
    const score = Math.round(numeric * 10) / 10;
    const canonical = JSON.stringify({
      score,
      briefReason:
        typeof parsed.briefReason === "string"
          ? parsed.briefReason
          : typeof parsed.reason === "string"
            ? parsed.reason
            : null,
      topFixes: parsed.topFixes ?? parsed.fixes ?? [],
      blockScores: parsed.blockScores ?? null,
    });
    return { score, canonical };
  } catch {
    return null;
  }
}

/**
 * Drives chatgpt.com through an existing Chrome session (CDP),
 * same pattern as Google Flow image batches.
 */
export class ChatGptBrowserProvider implements BrowserModelProvider {
  readonly key = "chatgpt";
  readonly displayName = "ChatGPT (Chrome CDP)";

  private context: BrowserSessionContext | null = null;
  private browser: PlaywrightBrowser | null = null;
  private page: PlaywrightPage | null = null;
  private ownsBrowser = false;
  private pending = new Map<string, PendingSubmission>();
  private conversationCounter = 0;
  private abortChecker: (() => boolean) | null = null;
  private lastPromptUsedAttachment = false;

  setAbortChecker(checker: (() => boolean) | null): void {
    this.abortChecker = checker;
  }

  async openSession(context: BrowserSessionContext): Promise<void> {
    this.context = context;
    const playwright = (await import("playwright")) as unknown as PlaywrightModule;
    const cdpUrl = context.cdpUrl?.trim() || DEFAULT_CDP_URL;

    if (context.launchMode === "connect_cdp" || cdpUrl) {
      try {
        this.browser = await playwright.chromium.connectOverCDP(cdpUrl, {
          // Stuck tabs (endless spinner) can make Playwright hang after
          // `<ws connected>`; keep this high enough for a busy Chrome profile.
          timeout: 45000,
        });
        this.ownsBrowser = false;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown CDP connection error.";
        throw new Error(
          `Could not connect to Chrome at ${cdpUrl}. Start Chrome with remote debugging (same profile you use for Google login / ChatGPT), e.g. --remote-debugging-port=9222. ${message}`,
        );
      }
    } else {
      const persistent = await playwright.chromium.launchPersistentContext(
        context.profileDir,
        {
          headless: !context.headful,
          channel: "chrome",
          viewport: { width: 1400, height: 900 },
        },
      );
      this.browser = {
        contexts: () => [persistent],
        close: async () => {
          await persistent.close?.();
        },
      };
      this.ownsBrowser = true;
    }

    this.page = await this.resolveChatGptPage();
    await this.ensureClipboardPermissions();
    await this.ensureComposerReady();
  }

  async checkSession(): Promise<BrowserSessionCheck> {
    if (!this.page) {
      return {
        authenticated: false,
        requiresUserAction: true,
        message:
          "ChatGPT browser session is not open. Start Chrome with CDP and run again.",
      };
    }

    const loginNeeded = await this.page.evaluate(() => {
      const body = document.body?.innerText?.toLowerCase() ?? "";
      return (
        body.includes("log in") ||
        body.includes("sign up") ||
        Boolean(document.querySelector('button[data-testid="login-button"]'))
      );
    });

    if (loginNeeded) {
      return {
        authenticated: false,
        requiresUserAction: true,
        message:
          "ChatGPT is not logged in. Log in with your Google account in the Chrome CDP window, then retry Run Batch.",
      };
    }

    try {
      await this.findFirstVisible(PROMPT_SELECTORS, 8000);
      return { authenticated: true, requiresUserAction: false };
    } catch {
      return {
        authenticated: false,
        requiresUserAction: true,
        message:
          "Could not find the ChatGPT composer. Open chatgpt.com in the CDP Chrome window and confirm you are logged in.",
      };
    }
  }

  private isComposerInteractionError(error: unknown): boolean {
    const message =
      error instanceof Error
        ? `${error.name}: ${error.message}`
        : String(error ?? "");
    return /locator\.click|prompt-textarea|performing click action|composer \(#prompt-textarea\)|composer was not found|chatgpt composer|#prompt-textarea/i.test(
      message,
    );
  }

  /**
   * Hard reset when ProseMirror / overlays leave the composer unclickable.
   * Prefer this over failing the whole fill chunk / pipeline step.
   */
  private async recoverComposerByReload(reason: string) {
    if (!this.page) {
      throw new Error("ChatGPT session is not open.");
    }

    console.warn("[chatgpt-browser] recovering composer via page reload", {
      reason: reason.slice(0, 240),
      url: this.page.url?.() ?? null,
    });

    try {
      await this.page.keyboard.press("Escape");
    } catch {
      // ignore
    }

    try {
      await this.page.reload({
        waitUntil: "domcontentloaded",
        timeout: this.context?.timeoutMs ?? 180000,
      });
    } catch (reloadError) {
      // Tab may be wedged — navigate fresh instead of dying on reload.
      console.warn("[chatgpt-browser] reload failed; navigating to chatgpt.com", {
        message:
          reloadError instanceof Error
            ? reloadError.message
            : String(reloadError),
      });
      await this.page.goto(CHATGPT_URL, {
        waitUntil: "domcontentloaded",
        timeout: this.context?.timeoutMs ?? 180000,
      });
    }

    await this.page.waitForTimeout(2000);
    await this.ensureComposerReady();
    await this.page.waitForTimeout(800);
    try {
      await this.page.keyboard.press("Escape");
    } catch {
      // ignore
    }
  }

  async submitPrompt(input: {
    jobId: string;
    prompt: string;
    conversationMode: "new" | "continue";
    conversationId?: string;
    conversationStartUrl?: string;
    expectReplyKind?: BrowserExpectReplyKind;
  }): Promise<BrowserSubmissionResult> {
    if (!this.page) {
      throw new Error("ChatGPT session is not open.");
    }

    const session = await this.checkSession();
    if (!session.authenticated) {
      throw new BrowserSessionExpiredError(
        session.message || "ChatGPT session requires login.",
      );
    }

    const openFreshConversation = async () => {
      const startUrl =
        input.conversationStartUrl?.trim() ||
        `${CHATGPT_URL.replace(/\/$/, "")}/`;
      console.info("[chatgpt-browser] opening conversation start URL", {
        startUrl,
      });
      await this.page!.goto(startUrl, {
        waitUntil: "domcontentloaded",
        timeout: this.context?.timeoutMs ?? 180000,
      });
      await this.ensureComposerReady();
      // Model/reasoning pills mount slightly after the composer textarea.
      await this.page!.waitForTimeout(1500);
    };

    const prepareAndInsert = async () => {
      await this.ensurePreferredModelSelection();

      // Never start the next turn while the previous reply is still generating.
      // Score turns often stabilize while Stop is still visible; sending V2 then
      // produces "ChatGPT did not accept the prompt".
      await this.waitUntilGenerationIdle(
        input.conversationMode === "continue" ? 60000 : 15000,
      );

      const assistantBaselineCount = await this.page!
        .locator(ASSISTANT_SELECTOR)
        .count();
      const userBaselineCount = await this.page!.locator(USER_SELECTOR).count();
      const assistantBaselineText = (await this.readLastAssistantText()).trim();

      await this.insertPrompt(input.prompt, {
        expectReplyKind: input.expectReplyKind ?? "any",
      });
      await this.waitForSendEnabled(15000, {
        required: true,
        context: "before clicking Send",
      });
      await this.clickSend();
      await this.ensureUserMessageSubmitted(userBaselineCount, {
        usedAttachment: this.lastPromptUsedAttachment,
      });

      return {
        assistantBaselineCount,
        assistantBaselineText,
      };
    };

    if (input.conversationMode === "new") {
      try {
        await openFreshConversation();
      } catch (error) {
        if (!this.isComposerInteractionError(error)) {
          throw error;
        }
        await this.recoverComposerByReload(
          error instanceof Error ? error.message : String(error),
        );
        await openFreshConversation();
      }
    }

    let baselines: {
      assistantBaselineCount: number;
      assistantBaselineText: string;
    };
    try {
      baselines = await prepareAndInsert();
    } catch (error) {
      if (!this.isComposerInteractionError(error)) {
        throw error;
      }
      await this.recoverComposerByReload(
        error instanceof Error ? error.message : String(error),
      );
      // After reload, always open a clean composer thread for this turn.
      await openFreshConversation();
      baselines = await prepareAndInsert();
    }

    this.conversationCounter += 1;
    const conversationId =
      input.conversationMode === "continue" && input.conversationId
        ? input.conversationId
        : `chatgpt-conversation-${this.conversationCounter}`;
    const submissionId = `chatgpt-submission-${input.jobId}-${Date.now()}`;
    const submittedAt = new Date().toISOString();

    this.pending.set(submissionId, {
      conversationId,
      submittedAt,
      assistantBaselineCount: baselines.assistantBaselineCount,
      assistantBaselineText: baselines.assistantBaselineText,
      expectReplyKind: input.expectReplyKind ?? "any",
    });

    return { submissionId, conversationId, submittedAt };
  }

  async waitForCompletion(
    submission: BrowserSubmissionResult,
  ): Promise<BrowserCompletionResult> {
    if (!this.page) {
      throw new Error("ChatGPT session is not open.");
    }

    const pending = this.pending.get(submission.submissionId);
    if (!pending) {
      throw new Error("Unknown ChatGPT submission.");
    }

    // Use the session timeout as-is (visual-plan batches need 15m+).
    // Previously capped at 420s, which aborted long drafts mid-wait.
    const timeoutMs = this.context?.timeoutMs ?? 300000;
    const started = Date.now();
    let stableText = "";
    let stableSince = 0;
    let lastWaitLogAt = 0;
    // Score replies often flicker in the DOM (whitespace/chrome) while the
    // numeric score is already final — track the number, not the raw string.
    let lastScoreNumber: number | null = null;
    let scoreNumberSince = 0;
    let lastCanonicalScore = "";

    let lastLengthStable = 0;
    let lengthStableSince = 0;
    // Once Stop has appeared, Send clearly landed — never fail-fast on a
    // delayed assistant DOM node (reasoning UI / role attribute lag).
    let sawGeneratingStop = false;
    let stopClearedSince = 0;

    while (Date.now() - started < timeoutMs) {
      if (this.abortChecker?.()) {
        await this.clickStopIfVisible();
        throw new BrowserAutomationError("Script Writer Batch canceled.", {
          code: "canceled",
        });
      }

      const stopVisible = await this.isAnyVisible(STOP_SELECTORS);
      if (stopVisible) {
        sawGeneratingStop = true;
        stopClearedSince = 0;
      } else if (sawGeneratingStop && !stopClearedSince) {
        stopClearedSince = Date.now();
      }
      const stopClearedForMs = stopClearedSince ? Date.now() - stopClearedSince : 0;

      const assistantCount = await this.page.locator(ASSISTANT_SELECTOR).count();
      const expectReplyKind = pending.expectReplyKind ?? "any";

      // Script turns: once Stop clears, don't sit for 180s on bubble-count.
      // Find the finished script (any assistant / Copy) and save it.
      if (
        expectReplyKind === "script" &&
        sawGeneratingStop &&
        !stopVisible &&
        stopClearedForMs >= 4000
      ) {
        const candidate = (
          await this.findScriptCandidateBeyondBaseline(
            pending.assistantBaselineText ?? "",
          )
        ).trim();
        if (candidate && looksLikeNarrationScript(candidate)) {
          if (candidate === stableText) {
            if (!stableSince) {
              stableSince = Date.now();
            }
          } else {
            stableText = candidate;
            stableSince = Date.now();
          }
          const candidateStableForMs = stableSince ? Date.now() - stableSince : 0;
          if (Date.now() - lastWaitLogAt > 10000) {
            lastWaitLogAt = Date.now();
            console.info("[chatgpt-browser] Waiting for reply…", {
              elapsedMs: Date.now() - started,
              length: candidate.length,
              stableForMs: candidateStableForMs,
              stopClearedForMs,
              expectReplyKind,
              mode: "script-after-stop",
              assistantCount,
              assistantBaselineCount: pending.assistantBaselineCount,
            });
          }
          if (candidateStableForMs >= 2500) {
            console.info(
              "[chatgpt-browser] Script reply accepted after Stop cleared (copy/DOM).",
              {
                length: candidate.length,
                stopClearedForMs,
                candidateStableForMs,
                assistantCount,
                assistantBaselineCount: pending.assistantBaselineCount,
              },
            );
            pending.capturedAssistantText = candidate;
            await this.captureCopyTurnIntoPending(submission.submissionId, {
              expectReplyKind,
              reason: "script-after-stop",
            });
            return {
              submissionId: submission.submissionId,
              conversationId: submission.conversationId,
              completedAt: new Date().toISOString(),
              stabilized: true,
            };
          }
          await this.sleepUnlessAborted(500);
          continue;
        }
      }

      if (assistantCount <= pending.assistantBaselineCount) {
        const elapsedMs = Date.now() - started;
        const liveAssistantText = (await this.readLastAssistantText()).trim();
        const inPlaceUpdate = shouldTreatAsNewAssistantContent({
          baselineText: pending.assistantBaselineText ?? "",
          currentText: liveAssistantText,
          expectReplyKind,
          stopVisible,
        });

        if (inPlaceUpdate) {
          console.info(
            "[chatgpt-browser] Assistant content changed without count bump; treating as new reply",
            {
              elapsedMs,
              assistantCount,
              assistantBaselineCount: pending.assistantBaselineCount,
              baselineLength: (pending.assistantBaselineText ?? "").length,
              liveLength: liveAssistantText.length,
              expectReplyKind,
              stopVisible,
            },
          );
          // Fall through into the normal completion checks below.
        } else {
          if (Date.now() - lastWaitLogAt > 15000) {
            lastWaitLogAt = Date.now();
            console.info("[chatgpt-browser] Waiting for reply…", {
              elapsedMs,
              length: liveAssistantText.length,
              stableForMs: 0,
              scoreStableForMs: 0,
              lastScoreNumber: null,
              stopVisible,
              looksLikeScore: false,
              looksLikeScenesJson: false,
              hasScoreJson: false,
              expectReplyKind,
              mode:
                stopVisible || sawGeneratingStop
                  ? "await-assistant-generating"
                  : "await-assistant",
              assistantCount,
              assistantBaselineCount: pending.assistantBaselineCount,
              sawGeneratingStop,
              stopClearedForMs,
            });
          }
          // Fail-fast only when Send truly looks dead. If Stop appeared at any
          // point, keep waiting for the assistant bubble — but not for the full
          // 15m session timeout once Stop has cleared with no new bubble.
          if (
            elapsedMs > 90000 &&
            !stopVisible &&
            !sawGeneratingStop
          ) {
            throw new BrowserAutomationError(
              "ChatGPT never started a new assistant reply after Send (90s). The composer may not have submitted.",
              { code: "provider_error" },
            );
          }
          if (
            shouldFailFastMissingAssistantBubble({
              elapsedMs,
              assistantCount,
              assistantBaselineCount: pending.assistantBaselineCount,
              stopVisible,
              sawGeneratingStop,
            })
          ) {
            const salvaged = await this.salvageAssistantAfterMissingBubble(
              pending,
            );
            if (salvaged) {
              console.warn(
                "[chatgpt-browser] Fail-fast avoided: salvaged assistant text after missing bubble count",
                { length: salvaged.length, expectReplyKind },
              );
              pending.capturedAssistantText = salvaged;
              await this.captureCopyTurnIntoPending(submission.submissionId, {
                expectReplyKind,
                reason: "fail-fast-salvage",
              });
              return {
                submissionId: submission.submissionId,
                conversationId: submission.conversationId,
                completedAt: new Date().toISOString(),
                stabilized: true,
              };
            }
            throw new BrowserAutomationError(
              "ChatGPT Stop cleared but no new assistant reply appeared within 180s. The turn likely failed to land.",
              { code: "provider_error" },
            );
          }
          await this.sleepUnlessAborted(
            stopVisible || sawGeneratingStop ? 2000 : 1000,
          );
          continue;
        }
      }

      // Lightweight progress sample first — avoid re-reading 100k+ JSON from the
      // DOM every second while ChatGPT is still streaming scenes / fill patches.
      const progress = await this.page.evaluate(() => {
        const assistants = [
          ...document.querySelectorAll(
            '[data-message-author-role="assistant"]',
          ),
        ] as HTMLElement[];
        const last = assistants.at(-1);
        const text = (last?.innerText || "").trim();
        const tail = text.slice(-80);
        const bodyHead = (document.body?.innerText || "").slice(0, 4000).toLowerCase();
        const hasSceneOrImage =
          /"sceneType"\s*:/.test(text) || /"imagePrompt"\s*:/.test(text);
        const looksLikeScenesJson =
          hasSceneOrImage &&
          (/"scriptText"\s*:/.test(text) ||
            (/"order"\s*:/.test(text) && /"visualIdea"\s*:/.test(text)));
        return {
          length: text.length,
          tail,
          looksLikeScenesJson,
          rateLimited:
            bodyHead.includes("too many requests") ||
            bodyHead.includes("rate limit") ||
            bodyHead.includes("you've hit your limit"),
        };
      });

      if (progress.rateLimited) {
        throw new BrowserRateLimitError();
      }

      if (progress.length === lastLengthStable) {
        if (!lengthStableSince) {
          lengthStableSince = Date.now();
        }
      } else {
        lastLengthStable = progress.length;
        lengthStableSince = Date.now();
      }
      const lengthStableForMs = lengthStableSince
        ? Date.now() - lengthStableSince
        : 0;

      // While a large scenes/fill JSON is still streaming, only log + wait.
      // Exception: ChatGPT (esp. GPT-5.x Alta) often leaves Stop visible long
      // after the scenes JSON length has stopped growing. Without this escape,
      // Visual Plan hangs until the full session timeout with 0 checkpoints.
      if (
        stopVisible &&
        progress.looksLikeScenesJson &&
        progress.length >= 8000
      ) {
        const closedTail = /\]\s*$/.test(progress.tail.trim());
        if (lengthStableForMs >= 12000 && closedTail) {
          console.info(
            "[chatgpt-browser] Visual-plan JSON accepted (stable while Stop visible).",
            {
              length: progress.length,
              lengthStableForMs,
              stopVisible: true,
              preview: progress.tail,
            },
          );
          return {
            submissionId: submission.submissionId,
            conversationId: submission.conversationId,
            completedAt: new Date().toISOString(),
            stabilized: true,
          };
        }
        if (Date.now() - lastWaitLogAt > 15000) {
          lastWaitLogAt = Date.now();
          console.info("[chatgpt-browser] Waiting for reply…", {
            elapsedMs: Date.now() - started,
            length: progress.length,
            lengthStableForMs,
            stableForMs: 0,
            scoreStableForMs: 0,
            lastScoreNumber: null,
            stopVisible: true,
            looksLikeScore: false,
            looksLikeScenesJson: true,
            hasScoreJson: false,
            mode: "stream-light",
            closedTail,
          });
        }
        await this.sleepUnlessAborted(4000);
        continue;
      }

      // Finished hybrid fill / scenes JSON: prefer length stability over
      // byte-identical DOM text (ChatGPT chrome flickers and used to hang forever).
      if (
        !stopVisible &&
        progress.looksLikeScenesJson &&
        progress.length >= 200 &&
        lengthStableForMs >= 2000 &&
        /\]\s*$/.test(progress.tail.trim())
      ) {
        console.info("[chatgpt-browser] Visual-plan JSON accepted (length-stable).", {
          length: progress.length,
          lengthStableForMs,
          stopVisible,
          preview: progress.tail,
        });
        return {
          submissionId: submission.submissionId,
          conversationId: submission.conversationId,
          completedAt: new Date().toISOString(),
          stabilized: true,
        };
      }

      let text = (await this.readLastAssistantText()).trim();

      if (!text) {
        await this.sleepUnlessAborted(800);
        continue;
      }

      const narrationLike = looksLikeNarrationScript(text);

      let scoreJson = narrationLike
        ? null
        : extractEmbeddedScoreJson(text) ?? extractScoreJsonObject(text);
      // Large structured visual-plan reviews sometimes land in a canvas /
      // side panel while the assistant bubble stays short. Fall back to a
      // page-wide extract so we do not hang after the user can already see
      // the finished score JSON. Never steal an older on-page score while
      // the latest assistant message is clearly a narration script rewrite,
      // or while this turn expects a script reply.
      const looksLikeScenesEarly = looksLikeVisualPlanJson(text);
      if (
        expectReplyKind !== "script" &&
        !narrationLike &&
        (!scoreJson || !/"passes"\s*:/i.test(scoreJson)) &&
        !(looksLikeScenesEarly && text.length > 15000)
      ) {
        const pageScore = await this.readPageScoreJson();
        if (pageScore) {
          scoreJson =
            extractEmbeddedScoreJson(pageScore) ??
            extractScoreJsonObject(pageScore) ??
            pageScore;
          // Only replace short assistant chrome with page score — never replace
          // a long draft/script bubble with a leftover critique from earlier.
          if (
            scoreJson &&
            scoreJson.length > text.length &&
            text.length < 500 &&
            !looksLikeNarrationScript(text)
          ) {
            text = scoreJson;
          }
        }
      }
      const scoreMeta = narrationLike ? null : canonicalizeScorePayload(scoreJson);
      const trackedText = scoreMeta?.canonical ?? text;

      if (narrationLike || expectReplyKind === "script") {
        // A rewrite/script bubble must never inherit the previous score clock.
        lastScoreNumber = null;
        lastCanonicalScore = "";
        scoreNumberSince = 0;
      }

      if (trackedText === stableText) {
        if (!stableSince) {
          stableSince = Date.now();
        }
      } else {
        stableText = trackedText;
        stableSince = Date.now();
      }

      if (scoreMeta && expectReplyKind !== "script") {
        if (scoreMeta.score === lastScoreNumber) {
          // Same numeric score — keep the clock even if whitespace/key order
          // or briefReason text flickers in the DOM.
          lastCanonicalScore = scoreMeta.canonical;
          if (!scoreNumberSince) {
            scoreNumberSince = Date.now();
          }
        } else {
          lastScoreNumber = scoreMeta.score;
          lastCanonicalScore = scoreMeta.canonical;
          scoreNumberSince = Date.now();
        }
      } else if (
        // Transient extract miss: do not zero the score clock (that left
        // finished critiques hanging with stableForMs/scoreStableForMs at 0).
        lastScoreNumber != null &&
        looksLikeVisualPlanJson(text) &&
        !/"score"\s*:/i.test(text)
      ) {
        lastScoreNumber = null;
        lastCanonicalScore = "";
        scoreNumberSince = 0;
      }

      const stableForMs = stableSince ? Date.now() - stableSince : 0;
      const scoreStableForMs = scoreNumberSince
        ? Date.now() - scoreNumberSince
        : 0;
      const looksLikeTopicJson = /"topics"\s*:\s*\[/.test(text);
      const looksLikeScenesJson = looksLikeVisualPlanJson(text);
      const hasScoreSignal =
        Boolean(scoreJson) || looksLikeScriptScoreResponse(text);
      const looksLikeScore = shouldAcceptAsScoreReply({
        expectReplyKind,
        narrationLike,
        hasScoreSignal,
      });
      const staleScoreWhileAwaitingScript =
        shouldKeepWaitingDespiteScoreLikeText({
          expectReplyKind,
          narrationLike,
          hasScoreSignal,
        });
      const looksLikeLongScript =
        narrationLike ||
        (!looksLikeScore &&
          !staleScoreWhileAwaitingScript &&
          !looksLikeScenesJson &&
          text.length > 800);
      const looksComplete = looksLikeTopicJson
        ? text.includes("```") || text.trimEnd().endsWith("}") || text.includes("}")
        : looksLikeScenesJson
          ? visualPlanJsonLooksClosed(text) || text.includes("]")
          : looksLikeScore || looksLikeLongScript || text.length > 500;

      const stableMsNeeded = looksLikeScore
        ? 600
        : looksLikeScenesJson
          ? 2500
          : 3500;

      // Stale score JSON from the previous turn must not complete a script wait.
      if (staleScoreWhileAwaitingScript) {
        if (Date.now() - lastWaitLogAt > 15000) {
          lastWaitLogAt = Date.now();
          console.info("[chatgpt-browser] Waiting for reply…", {
            elapsedMs: Date.now() - started,
            length: text.length,
            stableForMs,
            scoreStableForMs: 0,
            lengthStableForMs,
            lastScoreNumber: null,
            stopVisible,
            looksLikeScore: false,
            looksLikeScenesJson,
            hasScoreJson: Boolean(scoreJson),
            expectReplyKind,
            mode: "ignore-stale-score",
          });
        }
        await this.sleepUnlessAborted(1000);
        continue;
      }

      // Do not accept a narration draft while this turn expects score JSON.
      if (
        expectReplyKind === "score" &&
        narrationLike &&
        !hasScoreSignal
      ) {
        if (Date.now() - lastWaitLogAt > 15000) {
          lastWaitLogAt = Date.now();
          console.info("[chatgpt-browser] Waiting for reply…", {
            elapsedMs: Date.now() - started,
            length: text.length,
            stableForMs,
            scoreStableForMs,
            lengthStableForMs,
            lastScoreNumber,
            stopVisible,
            looksLikeScore: false,
            looksLikeScenesJson,
            hasScoreJson: false,
            expectReplyKind,
            mode: "await-score-not-script",
          });
        }
        await this.sleepUnlessAborted(1000);
        continue;
      }

      // Accept as soon as the numeric score holds steady — do not require the
      // raw JSON string to be byte-identical (DOM flicker was leaving 8.x/9.x
      // replies hanging with stableForMs stuck at 0).
      if (
        looksLikeScore &&
        lastScoreNumber != null &&
        scoreStableForMs >= 600 &&
        !looksLikeScenesJson
      ) {
        const captured = (lastCanonicalScore || scoreJson || "").trim();
        console.info("[chatgpt-browser] Score reply stabilized.", {
          score: lastScoreNumber,
          scoreStableForMs,
          stableForMs,
          stopVisible,
          expectReplyKind,
          preview: captured.slice(0, 120),
        });
        await this.finishScoreCompletion(submission, captured);
        return {
          submissionId: submission.submissionId,
          conversationId: submission.conversationId,
          completedAt: new Date().toISOString(),
          stabilized: true,
        };
      }

      if (
        looksLikeScore &&
        scoreJson &&
        stableForMs >= stableMsNeeded
      ) {
        console.info("[chatgpt-browser] Score reply stabilized (text).", {
          stableForMs,
          stopVisible,
          expectReplyKind,
          preview: scoreJson.slice(0, 120),
        });
        await this.finishScoreCompletion(submission, scoreJson);
        return {
          submissionId: submission.submissionId,
          conversationId: submission.conversationId,
          completedAt: new Date().toISOString(),
          stabilized: true,
        };
      }

      // Prose/JSON score without a tiny size cap: structured visual-plan
      // reviews routinely exceed 20KB once findings are listed.
      if (
        looksLikeScore &&
        !looksLikeScenesJson &&
        Boolean(scoreJson) &&
        (stableForMs >= 1200 || scoreStableForMs >= 600)
      ) {
        console.info("[chatgpt-browser] Score reply accepted.", {
          stableForMs,
          scoreStableForMs,
          stopVisible,
          length: text.length,
          score: lastScoreNumber,
          expectReplyKind,
        });
        await this.finishScoreCompletion(
          submission,
          lastCanonicalScore || scoreJson || text,
        );
        return {
          submissionId: submission.submissionId,
          conversationId: submission.conversationId,
          completedAt: new Date().toISOString(),
          stabilized: true,
        };
      }

      // Hybrid fill patches often flicker in the DOM; accept closed JSON once
      // Stop is gone and length has held steady briefly.
      if (
        !stopVisible &&
        looksLikeScenesJson &&
        visualPlanJsonLooksClosed(text) &&
        text.length > 200 &&
        (stableForMs >= 1500 || lengthStableForMs >= 2000)
      ) {
        console.info("[chatgpt-browser] Visual-plan JSON accepted.", {
          length: text.length,
          stableForMs,
          lengthStableForMs,
          stopVisible,
          preview: text.slice(0, 120),
        });
        return {
          submissionId: submission.submissionId,
          conversationId: submission.conversationId,
          completedAt: new Date().toISOString(),
          stabilized: true,
        };
      }

      if (
        !stopVisible &&
        looksComplete &&
        stableForMs >= stableMsNeeded &&
        text.length > 10
      ) {
        await this.captureCopyTurnIntoPending(submission.submissionId, {
          expectReplyKind,
          reason: "stable-complete",
        });
        return {
          submissionId: submission.submissionId,
          conversationId: submission.conversationId,
          completedAt: new Date().toISOString(),
          stabilized: true,
        };
      }

      // Finished replies that are short (refusals, errors, tiny JSON) used to
      // hang forever because looksComplete required length > 500.
      if (!stopVisible && stableForMs >= 8000 && text.length >= 1) {
        console.info("[chatgpt-browser] Accepting stable finished reply.", {
          length: text.length,
          stableForMs,
          looksLikeScenesJson,
          looksLikeScore,
          preview: text.slice(0, 160),
        });
        await this.captureCopyTurnIntoPending(submission.submissionId, {
          expectReplyKind,
          reason: "stable-short",
        });
        return {
          submissionId: submission.submissionId,
          conversationId: submission.conversationId,
          completedAt: new Date().toISOString(),
          stabilized: true,
        };
      }

      if (
        stopVisible &&
        looksLikeLongScript &&
        stableForMs >= 18000 &&
        text.length > 1500
      ) {
        console.warn(
          "[chatgpt-browser] Accepting stable long reply while Stop still visible.",
          { length: text.length, stableForMs },
        );
        return {
          submissionId: submission.submissionId,
          conversationId: submission.conversationId,
          completedAt: new Date().toISOString(),
          stabilized: true,
        };
      }

      if (Date.now() - lastWaitLogAt > 15000) {
        lastWaitLogAt = Date.now();
        console.info("[chatgpt-browser] Waiting for reply…", {
          elapsedMs: Date.now() - started,
          length: text.length,
          stableForMs,
          scoreStableForMs,
          lengthStableForMs,
          lastScoreNumber,
          stopVisible,
          looksLikeScore,
          looksLikeScenesJson,
          hasScoreJson: Boolean(scoreJson),
          expectReplyKind,
        });
      }

      await this.sleepUnlessAborted(stopVisible && !looksLikeScore ? 1000 : 500);
    }

    throw new Error(
      `Timed out waiting for ChatGPT response after ${Math.round(timeoutMs / 1000)}s.`,
    );
  }

  async extractResponse(
    completion: BrowserCompletionResult,
  ): Promise<ExtractedModelResponse> {
    if (!this.page) {
      throw new Error("ChatGPT session is not open.");
    }

    const pending = this.pending.get(completion.submissionId);
    const expectReplyKind = pending?.expectReplyKind ?? "any";
    const capturedScoreJson = pending?.capturedScoreJson?.trim() || "";
    let text = (await this.readLastAssistantText()).trim();

    // Prefer ChatGPT's official Copy-turn action (clipboard). DOM innerText is
    // often truncated or missing speaker labels for long Max/Sara scripts.
    const copiedFromPending = pending?.capturedAssistantText?.trim() || "";
    const copied =
      copiedFromPending || (await this.copyLastAssistantTurnText());
    const preferred = preferCopiedAssistantText({
      domText: text,
      copiedText: copied,
      expectReplyKind,
      isNarrationScript: looksLikeNarrationScript,
    });
    if (preferred && preferred !== text) {
      console.info("[chatgpt-browser] Using Copy-turn clipboard for assistant text", {
        expectReplyKind,
        domLength: text.length,
        copiedLength: copied.length,
        preferredLength: preferred.length,
      });
      text = preferred;
    } else if (copied && !text) {
      text = copied;
    }

    this.pending.delete(completion.submissionId);

    // Only apply captured score JSON when the live bubble is NOT a script.
    // Otherwise a leftover critique can overwrite a finished V2 draft.
    if (capturedScoreJson && !looksLikeNarrationScript(text)) {
      const liveScore =
        extractEmbeddedScoreJson(text) ?? extractScoreJsonObject(text);
      const capturedScore =
        extractEmbeddedScoreJson(capturedScoreJson) ??
        extractScoreJsonObject(capturedScoreJson) ??
        capturedScoreJson;
      if (capturedScore && !liveScore) {
        console.info(
          "[chatgpt-browser] Using captured score JSON (live assistant text had none).",
          { capturedPreview: capturedScore.slice(0, 120) },
        );
        text = capturedScore;
      } else if (capturedScore && liveScore) {
        text = liveScore;
      }
    }

    if (!text) {
      return {
        text: "",
        finished: false,
        providerError: "ChatGPT returned an empty assistant message.",
      };
    }

    return {
      text,
      jsonText: extractJsonPayload(text),
      finished: true,
    };
  }

  /**
   * Wait for a generated image in the latest assistant turn, then download bytes
   * via the authenticated ChatGPT page (oaiusercontent / large content imgs).
   */
  async downloadLatestGeneratedImage(options?: {
    timeoutMs?: number;
  }): Promise<import("@/lib/browser-automation/types").BrowserGeneratedImage> {
    if (!this.page) {
      throw new Error("ChatGPT session is not open.");
    }

    const timeoutMs = options?.timeoutMs ?? 300_000;
    const started = Date.now();
    let lastError = "No generated image found yet.";

    while (Date.now() - started < timeoutMs) {
      if (this.abortChecker?.()) {
        throw new BrowserAutomationError("Thumbnail batch canceled.", {
          code: "canceled",
        });
      }

      const stopVisible = await this.isAnyVisible(STOP_SELECTORS);
      if (stopVisible) {
        await this.sleepUnlessAborted(1500);
        continue;
      }

      try {
        const payload = await this.page.evaluate(async () => {
          const assistants = Array.from(
            document.querySelectorAll(
              '[data-message-author-role="assistant"], [data-testid="assistant-message"]',
            ),
          );
          const root =
            assistants.length > 0
              ? assistants[assistants.length - 1]
              : document.body;

          const candidates = Array.from(root?.querySelectorAll("img") ?? []).filter(
            (img) => {
              const el = img as HTMLImageElement;
              const src = (el.currentSrc || el.src || "").trim();
              if (!src || src.startsWith("data:image/svg")) {
                return false;
              }
              const width = el.naturalWidth || el.width || 0;
              const height = el.naturalHeight || el.height || 0;
              const looksHosted =
                /oaiusercontent|oaidalle|chatgpt\.com\/.*image|blob:/i.test(src);
              const looksLarge = width >= 256 && height >= 256;
              return looksHosted || looksLarge;
            },
          ) as HTMLImageElement[];

          const target = candidates[candidates.length - 1];
          if (!target) {
            return { ok: false as const, error: "No candidate image in last assistant turn." };
          }

          const src = (target.currentSrc || target.src || "").trim();
          const response = await fetch(src, { credentials: "include" });
          if (!response.ok) {
            return {
              ok: false as const,
              error: `Image fetch failed (HTTP ${response.status}).`,
            };
          }
          const contentType =
            response.headers.get("content-type") || "image/png";
          const buffer = await response.arrayBuffer();
          if (buffer.byteLength < 2048) {
            return {
              ok: false as const,
              error: `Image too small (${buffer.byteLength} bytes).`,
            };
          }
          const bytes = new Uint8Array(buffer);
          let binary = "";
          const chunk = 0x8000;
          for (let i = 0; i < bytes.length; i += chunk) {
            binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
          }
          return {
            ok: true as const,
            base64: btoa(binary),
            contentType,
            sourceUrl: src.slice(0, 300),
          };
        });

        if (payload.ok) {
          return {
            bytes: Buffer.from(payload.base64, "base64"),
            contentType: payload.contentType || "image/png",
            sourceUrl: payload.sourceUrl ?? null,
          };
        }
        lastError = payload.error || lastError;
      } catch (error) {
        lastError =
          error instanceof Error ? error.message : "Image download evaluate failed.";
      }

      await this.sleepUnlessAborted(2000);
    }

    throw new Error(
      `Timed out waiting for ChatGPT thumbnail image after ${Math.round(timeoutMs / 1000)}s. ${lastError}`,
    );
  }

  async closeSession(): Promise<void> {
    this.pending.clear();
    this.abortChecker = null;
    this.page = null;

    // Always disconnect Playwright from CDP (or close launched Chromium).
    // For connectOverCDP this does not quit the user's Chrome process.
    if (this.browser?.close) {
      try {
        await this.browser.close();
      } catch {
        // ignore disconnect races
      }
    }

    this.browser = null;
    this.context = null;
  }

  private async readPageScoreJson() {
    if (!this.page) {
      return "";
    }

    return this.page.evaluate(() => {
      const extractBalancedJsonAt = (raw: string, start: number): string | null => {
        if (start < 0 || start >= raw.length) {
          return null;
        }
        const open = raw[start];
        if (open !== "{" && open !== "[") {
          return null;
        }
        const close = open === "{" ? "}" : "]";
        let depth = 0;
        let inString = false;
        let escape = false;
        for (let i = start; i < raw.length; i += 1) {
          const ch = raw[i]!;
          if (inString) {
            if (escape) {
              escape = false;
              continue;
            }
            if (ch === "\\") {
              escape = true;
              continue;
            }
            if (ch === '"') {
              inString = false;
            }
            continue;
          }
          if (ch === '"') {
            inString = true;
            continue;
          }
          if (ch === open) {
            depth += 1;
            continue;
          }
          if (ch === close) {
            depth -= 1;
            if (depth === 0) {
              return raw.slice(start, i + 1);
            }
          }
        }
        return null;
      };

      const extractScoreObject = (fullText: string): string | null => {
        const scorePattern = /"score"\s*:/gi;
        let match: RegExpExecArray | null;
        let best: string | null = null;
        while ((match = scorePattern.exec(fullText)) !== null) {
          const fromBrace = fullText.lastIndexOf("{", match.index);
          if (fromBrace < 0) {
            continue;
          }
          const balanced = extractBalancedJsonAt(fullText, fromBrace);
          if (!balanced) {
            continue;
          }
          try {
            const parsed = JSON.parse(balanced) as {
              score?: unknown;
              passes?: unknown;
              evaluatedVersion?: unknown;
              sceneFindings?: unknown;
            };
            const score = parsed.score;
            const numeric =
              typeof score === "number"
                ? score
                : typeof score === "string"
                  ? Number(String(score).trim().replace(",", "."))
                  : NaN;
            if (!Number.isFinite(numeric) || numeric < 0 || numeric > 10) {
              continue;
            }
            const looksLikeVisualPlanReview =
              typeof parsed.passes === "boolean" ||
              typeof parsed.evaluatedVersion === "string" ||
              Array.isArray(parsed.sceneFindings);
            if (looksLikeVisualPlanReview) {
              return balanced;
            }
            if (!best || balanced.length > best.length) {
              best = balanced;
            }
          } catch {
            // try next
          }
        }
        return best;
      };

      const roots: string[] = [];
      const body = document.body?.innerText || "";
      if (body) {
        roots.push(body);
      }
      for (const node of Array.from(
        document.querySelectorAll(
          '[data-testid*="canvas"], [class*="canvas"], [class*="artifact"], pre, code',
        ),
      )) {
        const text = ((node as HTMLElement).innerText || node.textContent || "").trim();
        if (text.length > 200 && /"score"\s*:/i.test(text)) {
          roots.push(text);
        }
      }

      for (const root of roots) {
        const found = extractScoreObject(root);
        if (found && /"passes"\s*:/i.test(found)) {
          return found;
        }
      }
      for (const root of roots) {
        const found = extractScoreObject(root);
        if (found) {
          return found;
        }
      }
      return "";
    });
  }

  private async readLastAssistantText() {
    if (!this.page) {
      return "";
    }

    const fromDom = await this.page.evaluate((selector) => {
      const extractBalancedJsonAt = (raw: string, start: number): string | null => {
        if (start < 0 || start >= raw.length) {
          return null;
        }
        const open = raw[start];
        if (open !== "{" && open !== "[") {
          return null;
        }
        const close = open === "{" ? "}" : "]";
        let depth = 0;
        let inString = false;
        let escape = false;
        for (let i = start; i < raw.length; i += 1) {
          const ch = raw[i]!;
          if (inString) {
            if (escape) {
              escape = false;
              continue;
            }
            if (ch === "\\") {
              escape = true;
              continue;
            }
            if (ch === '"') {
              inString = false;
            }
            continue;
          }
          if (ch === '"') {
            inString = true;
            continue;
          }
          if (ch === open) {
            depth += 1;
            continue;
          }
          if (ch === close) {
            depth -= 1;
            if (depth === 0) {
              return raw.slice(start, i + 1);
            }
          }
        }
        return null;
      };

      const extractScoreObject = (fullText: string): string | null => {
        const scorePattern = /"score"\s*:/gi;
        let match: RegExpExecArray | null;
        while ((match = scorePattern.exec(fullText)) !== null) {
          const fromBrace = fullText.lastIndexOf("{", match.index);
          if (fromBrace < 0) {
            continue;
          }
          const balanced = extractBalancedJsonAt(fullText, fromBrace);
          if (!balanced) {
            continue;
          }
          try {
            const parsed = JSON.parse(balanced) as { score?: unknown };
            const score = parsed.score;
            const numeric =
              typeof score === "number"
                ? score
                : typeof score === "string"
                  ? Number(String(score).trim().replace(",", "."))
                  : NaN;
            if (Number.isFinite(numeric) && numeric >= 0 && numeric <= 10) {
              return balanced;
            }
          } catch {
            // try next
          }
        }
        return null;
      };

      const nodes = Array.from(document.querySelectorAll(selector));
      const last = nodes[nodes.length - 1] as HTMLElement | undefined;
      if (!last) {
        return "";
      }

      const markdown = last.querySelector(
        '.markdown, .prose, [class*="markdown"]',
      ) as HTMLElement | null;
      const fullText = (
        markdown?.innerText ||
        markdown?.textContent ||
        last.innerText ||
        last.textContent ||
        ""
      ).trim();

      // Prefer a complete score JSON blob when the latest reply is a critique.
      const scoreObject = extractScoreObject(fullText);
      if (scoreObject) {
        return scoreObject;
      }

      const codeBlocks = Array.from(last.querySelectorAll("pre code, code"))
        .map((node) => (node.textContent || "").trim())
        .filter(
          (block) =>
            block.includes('"topics"') ||
            block.includes('"scriptText"') ||
            block.includes('"score"') ||
            block.startsWith("{") ||
            block.startsWith("["),
        );

      if (codeBlocks.length > 0) {
        const lastBlock = codeBlocks[codeBlocks.length - 1] ?? "";
        const scoreInCode = extractScoreObject(lastBlock);
        return scoreInCode || lastBlock;
      }

      const preBlocks = Array.from(last.querySelectorAll("pre"))
        .map((node) => (node.textContent || "").trim())
        .filter(Boolean);

      if (preBlocks.length > 0) {
        const joined = preBlocks.join("\n\n");
        return extractScoreObject(joined) || joined;
      }

      return fullText;
    }, ASSISTANT_SELECTOR);

    if (typeof fromDom === "string" && fromDom.trim()) {
      const bubble = fromDom.trim();
      if (this.looksLikeJsonFileHandoff(bubble)) {
        const fromFile = await this.readAssistantJsonFileAttachment();
        if (fromFile && fromFile.length > bubble.length) {
          return fromFile;
        }
      }
      return bubble;
    }

    // Do NOT call locator(...).last().innerText() when there are zero matches —
    // Playwright waits up to 30s and throws, which stuck Visual Plan / pipeline.
    const assistantCount = await this.page.locator(ASSISTANT_SELECTOR).count();
    if (assistantCount < 1) {
      return "";
    }

    try {
      const fallback = (
        await this.page
          .locator(ASSISTANT_SELECTOR)
          .last()
          .innerText({ timeout: 2000 })
      ).trim();
      if (this.looksLikeJsonFileHandoff(fallback)) {
        const fromFile = await this.readAssistantJsonFileAttachment();
        if (fromFile && fromFile.length > fallback.length) {
          return fromFile;
        }
      }
      return fallback;
    } catch {
      return "";
    }
  }

  private looksLikeJsonFileHandoff(text: string) {
    const trimmed = text.trim();
    if (!trimmed || trimmed.length > 1200) {
      return false;
    }
    return (
      /\.json\b/i.test(trimmed) &&
      !/"scriptText"\s*:/.test(trimmed) &&
      !/"overallScore"\s*:/.test(trimmed) &&
      !/"score"\s*:/.test(trimmed)
    );
  }

  /**
   * ChatGPT sometimes returns a downloadable .json file instead of inline JSON.
   * Open the attachment chip and read the CodeMirror / file viewer contents.
   */
  private async readAssistantJsonFileAttachment() {
    if (!this.page) {
      return "";
    }

    const alreadyOpen = await this.page.evaluate(() => {
      const nodes = [
        ...document.querySelectorAll("pre.cm-content, .cm-content, pre code"),
      ] as HTMLElement[];
      let best = "";
      for (const node of nodes) {
        const text = (node.innerText || node.textContent || "").trim();
        if (
          text.includes('"scriptText"') &&
          text.length > best.length &&
          text.length < 3_000_000
        ) {
          best = text;
        }
      }
      return best;
    });
    if (alreadyOpen) {
      return alreadyOpen;
    }

    try {
      const pageAny = this.page as unknown as {
        locator: (selector: string) => {
          filter: (options: { hasText?: RegExp; has?: unknown }) => {
            last: () => {
              click: (options?: { timeout?: number }) => Promise<void>;
              count?: () => Promise<number>;
            };
          };
          last: () => {
            click: (options?: { timeout?: number }) => Promise<void>;
          };
        };
      };
      // Prefer the file chip inside the latest assistant turn.
      await pageAny
        .locator(`${ASSISTANT_SELECTOR} button[aria-label$=".json"]`)
        .last()
        .click({ timeout: 4000 });
    } catch {
      const clicked = await this.page.evaluate((selector) => {
        const assistants = [...document.querySelectorAll(selector)];
        const last = assistants[assistants.length - 1] as HTMLElement | undefined;
        const button = last?.querySelector(
          'button[aria-label$=".json"]',
        ) as HTMLElement | null;
        if (!button) {
          return false;
        }
        button.click();
        return true;
      }, ASSISTANT_SELECTOR);
      if (!clicked) {
        return "";
      }
    }

    await this.page.waitForTimeout(1200);

    return this.page.evaluate(() => {
      const nodes = [
        ...document.querySelectorAll("pre.cm-content, .cm-content, pre code"),
      ] as HTMLElement[];
      let best = "";
      for (const node of nodes) {
        const text = (node.innerText || node.textContent || "").trim();
        if (
          (text.includes('"scriptText"') || text.trimStart().startsWith("[")) &&
          text.length > best.length &&
          text.length < 3_000_000
        ) {
          best = text;
        }
      }
      return best;
    });
  }

  private async resolveChatGptPage(): Promise<PlaywrightPage> {
    if (!this.browser) {
      throw new Error("Browser is not connected.");
    }

    const contexts = this.browser.contexts?.() ?? [];
    const pages = contexts.flatMap((context) => context.pages());
    const existing =
      pages.find((page) => {
        const url = page.url();
        return url.includes("chatgpt.com") || url.includes("chat.openai.com");
      }) ?? null;

    if (existing) {
      await existing.bringToFront?.();
      return existing;
    }

    const context = contexts[0] ?? null;
    const page = context
      ? await context.newPage()
      : this.browser.newPage
        ? await this.browser.newPage()
        : null;

    if (!page) {
      throw new Error("Could not open a ChatGPT tab in the Chrome CDP session.");
    }

    await page.goto(CHATGPT_URL, {
      waitUntil: "domcontentloaded",
      timeout: this.context?.timeoutMs ?? 180000,
    });

    return page;
  }

  private async ensureComposerReady() {
    if (!this.page) {
      return;
    }

    try {
      await this.findFirstVisible(PROMPT_SELECTORS, 20000);
    } catch {
      throw new BrowserSelectorNotFoundError(
        "ChatGPT composer (#prompt-textarea) was not found. Open chatgpt.com and log in with Google in the CDP Chrome window.",
      );
    }
  }

  /**
   * Force ChatGPT composer model + reasoning before each send.
   * Default: GPT-5.5 + Alta (avoids slow GPT-5.6 Sol High).
   */
  private async ensurePreferredModelSelection() {
    if (!this.page) {
      return;
    }

    const model = PREFERRED_CHATGPT_MODEL;
    const reasoning = PREFERRED_CHATGPT_REASONING;
    const reasoningAliases = reasoningEffortAliases(reasoning);

    try {
      await this.page.keyboard.press("Escape");
      await this.page.waitForTimeout(250);

      if (await this.isPreferredModelChip(model, reasoningAliases)) {
        console.info("[chatgpt-browser] model already selected", {
          model,
          reasoning,
        });
        return;
      }

      if (!(await this.openComposerModelMenu())) {
        throw new Error("Could not open ChatGPT model picker.");
      }
      await this.page.waitForTimeout(500);
      await this.selectModelFamily(model);
      await this.page.waitForTimeout(500);

      if (!(await this.isPreferredModelChip(model, reasoningAliases))) {
        if (!(await this.openComposerModelMenu())) {
          throw new Error("Could not reopen ChatGPT model picker for reasoning.");
        }
        await this.page.waitForTimeout(400);
        await this.selectReasoningEffort(reasoningAliases);
        await this.page.waitForTimeout(350);
      }

      await this.page.keyboard.press("Escape");
      await this.page.waitForTimeout(200);

      const chipText = await this.readComposerModelChipText();
      console.info("[chatgpt-browser] preferred model applied", {
        model,
        reasoning,
        chipText,
      });

      if (!(await this.isPreferredModelChip(model, reasoningAliases))) {
        throw new Error(
          `ChatGPT model chip is "${chipText || "(empty)"}"; expected ${model} + ${reasoning}.`,
        );
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown model picker error.";
      console.warn("[chatgpt-browser] Failed to enforce preferred model.", message);
      throw new BrowserAutomationError(
        `Could not select ChatGPT ${model} / ${reasoning}: ${message}`,
        { code: "provider_error" },
      );
    }
  }

  private async readComposerModelChipText() {
    if (!this.page) {
      return "";
    }
    return this.page.evaluate(() =>
      [...document.querySelectorAll("button")]
        .filter((el) => String(el.className || "").includes("composer-pill"))
        .map((el) => (el.innerText || "").replace(/\s+/g, " ").trim())
        .join(" | "),
    );
  }

  private async isPreferredModelChip(
    modelLabel: string,
    reasoningLabels: string[],
  ) {
    if (!this.page) {
      return false;
    }
    return this.page.evaluate(
      ({ model, reasoning }) => {
        const pills = [...document.querySelectorAll("button")].filter((el) =>
          String(el.className || "").includes("composer-pill"),
        );
        if (pills.length === 0) {
          return false;
        }
        const text = pills
          .map((el) => (el.innerText || "").replace(/\s+/g, " ").trim())
          .join(" | ")
          .toLowerCase();
        const wants55 = /gpt-5\.5|5\.5/i.test(model);
        const hasModel = wants55
          ? /\b5\.5\b/.test(text)
          : text.includes(model.toLowerCase());
        const hasReasoning = reasoning.some((label) =>
          text.includes(label.toLowerCase()),
        );
        return hasModel && hasReasoning;
      },
      { model: modelLabel, reasoning: reasoningLabels },
    );
  }

  private async openComposerModelMenu() {
    if (!this.page) {
      return false;
    }

    const menuOpen = async () =>
      this.page!.evaluate(
        () =>
          [...document.querySelectorAll('[role="menu"]')].length > 0 ||
          [...document.querySelectorAll("button")].some(
            (el) =>
              String(el.className || "").includes("composer-pill") &&
              el.getAttribute("aria-expanded") === "true",
          ),
      );

    // Prefer a real Playwright click — DOM click() is flaky on this Radix menu.
    try {
      const pageAny = this.page as unknown as {
        locator: (selector: string) => {
          filter: (options: { hasText: RegExp }) => {
            last: () => {
              click: (options?: { timeout?: number }) => Promise<void>;
            };
          };
        };
      };
      await pageAny
        .locator('button[class*="composer-pill"]')
        .filter({ hasText: /Alta|Media|Instant|High|Medium|5\./i })
        .last()
        .click({ timeout: 5000 });
    } catch {
      const clicked = await this.page.evaluate(() => {
        const pills = [...document.querySelectorAll("button")].filter((el) => {
          if (!String(el.className || "").includes("composer-pill")) {
            return false;
          }
          const text = (el.innerText || "").trim();
          return /Alta|Media|Instant|High|Medium|5\./i.test(text);
        }) as HTMLElement[];
        const pill = pills[pills.length - 1];
        if (!pill) {
          return false;
        }
        pill.click();
        return true;
      });
      if (!clicked) {
        return false;
      }
    }

    await this.page.waitForTimeout(500);
    if (await menuOpen()) {
      return true;
    }

    // Second attempt.
    try {
      const pageAny = this.page as unknown as {
        locator: (selector: string) => {
          filter: (options: { hasText: RegExp }) => {
            last: () => {
              click: (options?: { timeout?: number }) => Promise<void>;
            };
          };
        };
      };
      await pageAny
        .locator('button[class*="composer-pill"]')
        .filter({ hasText: /Alta|Media|Instant|High|Medium|5\./i })
        .last()
        .click({ timeout: 5000 });
    } catch {
      // fall through
    }
    await this.page.waitForTimeout(600);
    return menuOpen();
  }

  private async selectModelFamily(modelLabel: string) {
    if (!this.page) {
      return;
    }

    const triggerLocator = this.page.locator(
      '[role="menu"] [role="menuitem"][aria-haspopup="menu"]',
    );
    if ((await triggerLocator.count()) > 0) {
      const trigger = triggerLocator.first();
      try {
        if (typeof trigger.hover === "function") {
          await trigger.hover({ timeout: 4000 });
        }
        await this.page.waitForTimeout(350);
        await trigger.click({ timeout: 3000 }).catch(() => undefined);
      } catch {
        await this.page.evaluate(() => {
          const el = document.querySelector(
            '[role="menu"] [role="menuitem"][aria-haspopup="menu"]',
          ) as HTMLElement | null;
          if (!el) {
            return;
          }
          el.dispatchEvent(new MouseEvent("pointerenter", { bubbles: true }));
          el.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
          el.click();
        });
      }
      await this.page.waitForTimeout(600);
    }

    const deadline = Date.now() + 5000;
    let clicked = false;
    while (Date.now() < deadline) {
      clicked = await this.page.evaluate((wanted) => {
        const nodes = [
          ...document.querySelectorAll(
            '[role="menu"] [role="menuitem"], [role="menu"] [role="menuitemradio"], [role="menu"] button, [role="menu"] span, [role="menu"] div',
          ),
        ] as HTMLElement[];
        const exact = nodes.filter((el) => {
          const text = (el.innerText || "").trim().replace(/\s+/g, " ");
          if (text !== wanted) {
            return false;
          }
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && rect.height <= 40;
        });
        exact.sort((a, b) => {
          const ar = a.getBoundingClientRect();
          const br = b.getBoundingClientRect();
          return ar.height * ar.width - br.height * br.width;
        });
        const target = exact[0];
        if (!target) {
          return false;
        }
        target.click();
        return true;
      }, modelLabel);
      if (clicked) {
        break;
      }
      await this.page.waitForTimeout(250);
    }

    if (!clicked) {
      throw new Error(`Model option "${modelLabel}" not found in picker.`);
    }
  }

  private async selectReasoningEffort(aliases: string[]) {
    if (!this.page) {
      return;
    }

    const clicked = await this.page.evaluate((labels) => {
      const radios = [
        ...document.querySelectorAll('[role="menu"] [role="menuitemradio"]'),
      ] as HTMLElement[];
      for (const label of labels) {
        const match = radios.find((el) => {
          const text = (el.innerText || "").trim().replace(/\s+/g, " ");
          return text === label;
        });
        if (match) {
          match.click();
          return label;
        }
      }
      return null;
    }, aliases);

    if (!clicked) {
      throw new Error(`Reasoning option not found (${aliases.join(" / ")}).`);
    }
  }

  /**
   * Focus the ChatGPT ProseMirror composer without hanging on a normal click.
   * ChatGPT often reports the box as visible/stable while Playwright's click
   * stalls on "performing click action" (overlays / virtual keyboard / focus traps).
   */
  private async focusComposer(selector: string) {
    if (!this.page) {
      throw new Error("ChatGPT session is not open.");
    }

    const locator = this.page.locator(selector).first();
    await locator.waitFor({ state: "visible", timeout: 15000 });

    try {
      await locator.click({ timeout: 2500, force: true });
      return;
    } catch {
      // fall through
    }

    const focused = await this.page.evaluate((sel) => {
      const el = document.querySelector(sel) as HTMLElement | null;
      if (!el) {
        return false;
      }
      el.scrollIntoView({ block: "center", inline: "nearest" });
      el.focus();
      el.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }),
      );
      el.dispatchEvent(
        new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }),
      );
      el.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true, view: window }),
      );
      return document.activeElement === el || el.contains(document.activeElement);
    }, selector);

    if (!focused) {
      // Last resort: click the center of the box via coordinates (still force).
      await locator.click({ timeout: 3000, force: true, trial: false }).catch(() => undefined);
      await this.page.evaluate((sel) => {
        const el = document.querySelector(sel) as HTMLElement | null;
        el?.focus();
      }, selector);
    }
  }

  private async insertPrompt(
    prompt: string,
    options?: { expectReplyKind?: BrowserExpectReplyKind },
  ) {
    if (!this.page) {
      throw new Error("ChatGPT session is not open.");
    }

    this.lastPromptUsedAttachment = false;

    // Large prompts (visual-plan ~100k+, or script revisions with full draft)
    // must NOT go into the ProseMirror composer: insertText/execCommand freezes
    // or OOMs the ChatGPT tab, then Send appears to click but no message lands.
    if (prompt.length >= 8000) {
      await this.insertLargePromptAsAttachment(prompt, {
        expectReplyKind: options?.expectReplyKind ?? "any",
      });
      this.lastPromptUsedAttachment = true;
      return;
    }

    const selector = await this.findFirstVisible(PROMPT_SELECTORS, 15000);
    await this.focusComposer(selector);

    const inserted = await this.page.evaluate(
      ({ sel, text }) => {
        const el = document.querySelector(sel) as HTMLElement | null;
        if (!el) {
          return false;
        }

        el.focus();

        if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
          el.value = text;
          el.dispatchEvent(new Event("input", { bubbles: true }));
          return true;
        }

        // ProseMirror / contenteditable (short prompts only)
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(el);
        selection?.removeAllRanges();
        selection?.addRange(range);

        const ok = document.execCommand("insertText", false, text);
        if (!ok) {
          el.textContent = text;
          el.dispatchEvent(new InputEvent("input", { bubbles: true }));
        }

        return true;
      },
      { sel: selector, text: prompt },
    );

    if (!inserted) {
      throw new BrowserSelectorNotFoundError(
        "Failed to insert the topic batch prompt into ChatGPT.",
      );
    }

    await this.page.waitForTimeout(400);
  }

  /**
   * Attach a large request as a .md file and only put a short instruction
   * in the composer. Avoids ProseMirror OOM on ~100k visual-plan prompts.
   */
  private async insertLargePromptAsAttachment(
    prompt: string,
    options?: { expectReplyKind?: BrowserExpectReplyKind },
  ) {
    if (!this.page) {
      throw new Error("ChatGPT session is not open.");
    }

    const tmpPath = path.join(
      os.tmpdir(),
      `videomaker-chatgpt-prompt-${Date.now()}.md`,
    );
    await fs.writeFile(tmpPath, prompt, "utf8");
    console.info("[chatgpt-browser] attaching large prompt as file", {
      promptChars: prompt.length,
      tmpPath,
      expectReplyKind: options?.expectReplyKind ?? "any",
    });

    try {
      let fileInputCount = await this.page.locator('input[type="file"]').count();
      if (fileInputCount === 0) {
        const attachSelectors = [
          'button[aria-label*="Attach"]',
          'button[aria-label*="Adjuntar"]',
          'button[aria-label*="Upload files"]',
          'button[aria-label*="Subir"]',
          'button[data-testid="composer-plus-btn"]',
          'button[aria-label="+"]',
        ];
        let opened = false;
        for (const sel of attachSelectors) {
          const count = await this.page.locator(sel).count();
          if (count === 0) continue;
          try {
            await this.page.locator(sel).first().click({ timeout: 3000 });
            opened = true;
            break;
          } catch {
            // try next
          }
        }
        if (opened) {
          await this.page.waitForTimeout(400);
        }
        fileInputCount = await this.page.locator('input[type="file"]').count();
      }

      if (fileInputCount === 0) {
        throw new BrowserSelectorNotFoundError(
          "ChatGPT file input was not found for large-prompt attachment.",
        );
      }

      const fileInput = this.page.locator('input[type="file"]').first();
      if (!fileInput.setInputFiles) {
        throw new BrowserAutomationError(
          "Playwright setInputFiles is unavailable on this page locator.",
          { code: "provider_error" },
        );
      }
      await fileInput.setInputFiles(tmpPath);

      // Wait until ChatGPT shows the attachment chip (upload may still disable Send).
      const ready = await this.waitForAttachmentReady(25000);
      console.info("[chatgpt-browser] attachment ready", ready);
      if (!ready.ok || !ready.hasFileChip) {
        throw new BrowserAutomationError(
          "ChatGPT did not show the attached prompt file chip. Remove any stuck composer attachment and retry.",
          { code: "provider_error", requiresUserAction: true },
        );
      }

      // Script Writer / podcast drafts require plain narration. Topic/visual-plan
      // batches require JSON. Do not force JSON when the attached file forbids it.
      const shortInstruction =
        options?.expectReplyKind === "script"
          ? [
              "Read the attached request file completely and follow it exactly.",
              "Return ONLY the plain script text required by that attached file (bracket labels + dialogue).",
              "Paste the script inline in the assistant message.",
              "Do not attach, upload, or link a response file.",
              "Do not return JSON, markdown fences, or explanations.",
            ].join("\n")
          : [
              "Read the attached request file completely and follow it exactly.",
              "Return only the JSON output format required by that attached file.",
              "Paste the JSON inline in the assistant message.",
              "Do not attach, upload, or link a response file.",
              "Do not return markdown or explanations.",
            ].join("\n");

      await this.insertComposerText(shortInstruction);

      const sendReady = await this.waitForSendEnabled(25000, {
        required: false,
        context: "after attaching large prompt file",
      });
      if (!sendReady) {
        console.warn(
          "[chatgpt-browser] Send still disabled after attachment+instruction; re-inserting instruction",
        );
        await this.insertComposerText(shortInstruction);
        await this.waitForSendEnabled(20000, {
          required: true,
          context:
            "after attaching large prompt file — Send stayed disabled even with file chip + instruction. The attachment may still be uploading, or this project chat blocked Send",
        });
      }
    } finally {
      await fs.unlink(tmpPath).catch(() => undefined);
    }
  }

  private async insertComposerText(text: string) {
    if (!this.page) {
      throw new Error("ChatGPT session is not open.");
    }

    const selector = await this.findFirstVisible(PROMPT_SELECTORS, 15000);
    await this.focusComposer(selector);
    const inserted = await this.page.evaluate(
      ({ sel, value }) => {
        const el = document.querySelector(sel) as HTMLElement | null;
        if (!el) return false;
        el.focus();
        if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
          el.value = value;
          el.dispatchEvent(new Event("input", { bubbles: true }));
          return true;
        }
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(el);
        selection?.removeAllRanges();
        selection?.addRange(range);
        const ok = document.execCommand("insertText", false, value);
        if (!ok) {
          el.textContent = value;
          el.dispatchEvent(new InputEvent("input", { bubbles: true }));
        }
        return true;
      },
      { sel: selector, value: text },
    );
    if (!inserted) {
      throw new BrowserSelectorNotFoundError(
        "Failed to insert text into the ChatGPT composer.",
      );
    }
    await this.page.waitForTimeout(400);
  }

  private async waitForAttachmentReady(timeoutMs: number) {
    if (!this.page) {
      return { ok: false as const, reason: "no-page" as const };
    }
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const state = await this.page.evaluate(() => {
        const body = document.body?.innerText || "";
        const hasFileChip =
          /videomaker-chatgpt-prompt-|\.md\b/i.test(body.slice(-4000)) ||
          Boolean(
            document.querySelector(
              '[data-testid*="file"], [class*="attachment"], a[download]',
            ),
          );
        return { hasFileChip };
      });
      if (state.hasFileChip) {
        return { ok: true as const, hasFileChip: true as const };
      }
      await this.page.waitForTimeout(400);
    }
    return {
      ok: false as const,
      reason: "timeout" as const,
      hasFileChip: false as const,
    };
  }

  private async isSendButtonEnabled(): Promise<boolean> {
    if (!this.page) {
      return false;
    }

    for (const selector of SEND_SELECTORS) {
      const count = await this.page.locator(selector).count();
      if (count === 0) continue;
      try {
        const button = this.page.locator(selector).first();
        const disabled = await button.isDisabled?.();
        if (disabled === false) {
          return true;
        }
        if (disabled === true) {
          continue;
        }
      } catch {
        // fall through to DOM check
      }
    }

    // Fallback DOM check (covers aria-disabled / data-disabled).
    return this.page.evaluate((selectors) => {
      for (const sel of selectors) {
        const el = document.querySelector(sel) as HTMLButtonElement | null;
        if (!el) continue;
        const aria = el.getAttribute("aria-disabled");
        const data = el.getAttribute("data-disabled");
        if (el.disabled || aria === "true" || data === "true") continue;
        const style = window.getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden") continue;
        return true;
      }
      return false;
    }, SEND_SELECTORS);
  }

  private async waitForSendEnabled(
    timeoutMs: number,
    options?: { required?: boolean; context?: string },
  ): Promise<boolean> {
    if (!this.page) {
      if (options?.required) {
        throw new BrowserAutomationError(
          "ChatGPT session is not open while waiting for Send.",
          { code: "provider_error" },
        );
      }
      return false;
    }

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await this.isSendButtonEnabled()) {
        console.info("[chatgpt-browser] Send enabled", {
          context: options?.context ?? null,
          waitedMs: timeoutMs - Math.max(0, deadline - Date.now()),
        });
        return true;
      }
      await this.page.waitForTimeout(250);
    }

    console.warn("[chatgpt-browser] Send stayed disabled", {
      context: options?.context ?? null,
      timeoutMs,
    });

    if (options?.required) {
      const detail = options.context ? ` (${options.context})` : "";
      throw new BrowserAutomationError(
        `ChatGPT Send button stayed disabled${detail}. The composer may still be uploading an attachment, or the instruction text did not land. Remove any stuck file chip in the ChatGPT window and retry.`,
        { code: "provider_error", requiresUserAction: true },
      );
    }

    return false;
  }

  private async findScriptCandidateBeyondBaseline(baselineText: string) {
    if (!this.page) {
      return "";
    }

    const baseline = baselineText.trim();
    const fromDom = await this.page.evaluate(() => {
      const assistants = Array.from(
        document.querySelectorAll('[data-message-author-role="assistant"]'),
      );
      let best = "";
      for (let i = 0; i < assistants.length; i += 1) {
        const node = assistants[i];
        const markdown = node.querySelector(
          '.markdown, .prose, [class*="markdown"]',
        );
        const text = (
          (markdown && (markdown.innerText || markdown.textContent)) ||
          node.innerText ||
          node.textContent ||
          ""
        ).trim();
        if (text.length > best.length) {
          best = text;
        }
      }
      return best;
    });

    let best = typeof fromDom === "string" ? fromDom.trim() : "";

    // Prefer Copy-turn when it yields a longer / different script.
    try {
      const copied = (await this.copyLastAssistantTurnText()).trim();
      if (
        copied &&
        (copied.length > best.length ||
          (looksLikeNarrationScript(copied) && copied !== baseline))
      ) {
        best = preferCopiedAssistantText({
          domText: best,
          copiedText: copied,
          expectReplyKind: "script",
          isNarrationScript: looksLikeNarrationScript,
        });
      }
    } catch {
      // keep DOM candidate
    }

    if (!best || best === baseline) {
      return "";
    }
    if (!looksLikeNarrationScript(best)) {
      return "";
    }
    // Accept replacements even when length is similar (revised draft).
    if (
      baseline &&
      best.length < baseline.length + 50 &&
      best.startsWith(baseline.slice(0, Math.min(120, baseline.length)))
    ) {
      return "";
    }
    return best;
  }

  private async salvageAssistantAfterMissingBubble(
    pending: PendingSubmission,
  ): Promise<string> {
    const baseline = (pending.assistantBaselineText ?? "").trim();
    const expectReplyKind = pending.expectReplyKind ?? "any";

    let live = "";
    try {
      live = (await this.readLastAssistantText()).trim();
    } catch {
      live = "";
    }

    if (
      shouldTreatAsNewAssistantContent({
        baselineText: baseline,
        currentText: live,
        expectReplyKind,
        stopVisible: false,
      })
    ) {
      return live;
    }

    try {
      const copied = (await this.copyLastAssistantTurnText()).trim();
      if (
        shouldTreatAsNewAssistantContent({
          baselineText: baseline,
          currentText: copied,
          expectReplyKind,
          stopVisible: false,
        })
      ) {
        return copied;
      }
      // Last resort for scripts: clipboard already holds a full spine script
      // that differs from baseline (user/ChatGPT copy succeeded mid-wait).
      if (
        expectReplyKind === "script" &&
        looksLikeNarrationScript(copied) &&
        copied.length >= 1000 &&
        copied !== baseline
      ) {
        return copied;
      }
    } catch (error) {
      console.info("[chatgpt-browser] salvage copy failed", {
        message: error instanceof Error ? error.message : String(error),
      });
    }

    return "";
  }

  private async captureCopyTurnIntoPending(
    submissionId: string,
    options: { expectReplyKind: BrowserExpectReplyKind; reason: string },
  ) {
    const pending = this.pending.get(submissionId);
    if (!pending) {
      return;
    }
    // Score turns already capture JSON separately; still allow clipboard for
    // scripts / any long plain replies where DOM truncation is common.
    if (options.expectReplyKind === "score") {
      return;
    }
    try {
      const copied = await this.copyLastAssistantTurnText();
      if (copied.trim().length >= 40) {
        pending.capturedAssistantText = copied.trim();
        console.info("[chatgpt-browser] Stashed Copy-turn text on completion", {
          reason: options.reason,
          length: copied.trim().length,
        });
      }
    } catch (error) {
      console.info("[chatgpt-browser] Copy-turn stash failed", {
        reason: options.reason,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async ensureClipboardPermissions() {
    if (!this.page) {
      return;
    }
    try {
      await this.page.context().grantPermissions?.(
        ["clipboard-read", "clipboard-write"],
        { origin: "https://chatgpt.com" },
      );
    } catch (error) {
      console.info("[chatgpt-browser] clipboard permission grant skipped", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async readClipboardText() {
    if (!this.page) {
      return "";
    }
    try {
      return await this.page.evaluate(async () => {
        try {
          return await navigator.clipboard.readText();
        } catch {
          return "";
        }
      });
    } catch {
      return "";
    }
  }

  /**
   * Click ChatGPT's per-turn Copy button and read the clipboard.
   * More reliable than DOM innerText for long plain scripts ([MAX]/[SARA]/…).
   */
  private async copyLastAssistantTurnText() {
    if (!this.page) {
      return "";
    }

    await this.ensureClipboardPermissions();

    let before = "";
    try {
      before = (await this.readClipboardText()).trim();
    } catch {
      before = "";
    }

    const clicked = await this.clickLastCopyTurnButton();
    if (!clicked) {
      console.info("[chatgpt-browser] Copy-turn button not found");
      return "";
    }

    for (let attempt = 0; attempt < 25; attempt += 1) {
      await this.sleepUnlessAborted(120);
      const text = (await this.readClipboardText()).trim();
      if (!text) {
        continue;
      }
      if (text !== before) {
        console.info("[chatgpt-browser] Copied assistant turn via clipboard", {
          length: text.length,
        });
        return text;
      }
      // Same clipboard content as before — accept after a short settle when
      // the turn was already copied (or ChatGPT rewrote the same payload).
      if (attempt >= 8 && text.length >= 40) {
        console.info("[chatgpt-browser] Reusing clipboard after Copy-turn click", {
          length: text.length,
        });
        return text;
      }
    }

    return (await this.readClipboardText()).trim();
  }

  private async clickLastCopyTurnButton() {
    if (!this.page) {
      return false;
    }

    try {
      return await this.page.evaluate((selectors) => {
        const assistants = Array.from(
          document.querySelectorAll('[data-message-author-role="assistant"]'),
        );
        const lastAssistant = assistants[assistants.length - 1];

        let button = null;
        if (lastAssistant) {
          let root = lastAssistant;
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
          return false;
        }

        button.scrollIntoView({ block: "nearest", inline: "nearest" });
        button.click();
        return true;
      }, [...COPY_TURN_BUTTON_SELECTORS]);
    } catch (error) {
      console.info("[chatgpt-browser] Copy-turn click failed", {
        message: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  private async finishScoreCompletion(
    submission: BrowserSubmissionResult,
    capturedScoreJson: string,
  ) {
    const pending = this.pending.get(submission.submissionId);
    if (pending && capturedScoreJson.trim()) {
      pending.capturedScoreJson = capturedScoreJson.trim();
    }

    const stopVisible = await this.isAnyVisible(STOP_SELECTORS);
    if (stopVisible) {
      console.info(
        "[chatgpt-browser] Score captured; waiting for Stop to clear before next turn",
      );
      await this.waitUntilGenerationIdle(60000);
    } else {
      // Brief settle so the composer accepts the next prompt.
      await this.waitUntilGenerationIdle(8000);
    }
  }

  /**
   * Wait until ChatGPT is no longer generating (Stop gone and stays gone briefly).
   */
  private async waitUntilGenerationIdle(timeoutMs: number) {
    if (!this.page) {
      return;
    }

    const deadline = Date.now() + timeoutMs;
    let clearSince = 0;

    while (Date.now() < deadline) {
      if (this.abortChecker?.()) {
        await this.clickStopIfVisible();
        throw new BrowserAutomationError("Script Writer Batch canceled.", {
          code: "canceled",
        });
      }

      const stopVisible = await this.isAnyVisible(STOP_SELECTORS);
      if (!stopVisible) {
        if (!clearSince) {
          clearSince = Date.now();
        }
        // Require Stop gone briefly to avoid flicker between turns.
        if (Date.now() - clearSince >= 900) {
          console.info("[chatgpt-browser] generation idle", {
            waitedMs: timeoutMs - (deadline - Date.now()),
          });
          return;
        }
      } else {
        clearSince = 0;
      }

      await this.sleepUnlessAborted(400);
    }

    console.warn(
      "[chatgpt-browser] Stop still visible after idle wait; proceeding cautiously",
      { timeoutMs },
    );
  }

  private async readComposerText(): Promise<string> {
    if (!this.page) {
      return "";
    }
    try {
      return await this.page.evaluate((selectors) => {
        for (const sel of selectors) {
          const el = document.querySelector(sel) as HTMLElement | null;
          if (!el) continue;
          const text =
            el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement
              ? el.value
              : el.innerText || el.textContent || "";
          if (text.trim()) {
            return text.trim();
          }
        }
        return "";
      }, PROMPT_SELECTORS);
    } catch {
      return "";
    }
  }

  private async ensureUserMessageSubmitted(
    userBaselineCount: number,
    options?: { usedAttachment?: boolean },
  ) {
    if (!this.page) {
      return;
    }

    const assistantBaselineCount = await this.page
      .locator(ASSISTANT_SELECTOR)
      .count();
    const usedAttachment = Boolean(options?.usedAttachment);
    const timeoutMs = usedAttachment ? 60000 : 25000;
    const startedAt = Date.now();
    let sawStop = false;

    const submissionState = async () => {
      const userCount = await this.page!.locator(USER_SELECTOR).count();
      const assistantCount = await this.page!.locator(ASSISTANT_SELECTOR).count();
      const stopVisible = await this.isAnyVisible(STOP_SELECTORS);
      const composerText = await this.readComposerText();
      const sendEnabled = await this.isSendButtonEnabled();
      const composerEmpty = !composerText.trim();
      if (stopVisible) {
        sawStop = true;
      }

      if (userCount > userBaselineCount) {
        return { ok: true as const, reason: "new-user-bubble" as const };
      }
      if (stopVisible) {
        // Project / custom-GPT chats often hide or delay role=user bubbles while
        // Stop is already visible — Send clearly landed.
        return { ok: true as const, reason: "stop-visible-after-send" as const };
      }
      if (assistantCount > assistantBaselineCount) {
        return { ok: true as const, reason: "new-assistant-bubble" as const };
      }
      // File-attachment turns often start generating before a stable user bubble
      // is queryable. Empty composer + Stop is a strong in-flight signal.
      if (usedAttachment && stopVisible && composerEmpty) {
        return { ok: true as const, reason: "stop-with-empty-composer" as const };
      }
      // After a few seconds, empty composer + disabled Send usually means the
      // turn left the composer even if the user bubble selector lagged.
      if (
        composerEmpty &&
        !sendEnabled &&
        Date.now() - startedAt >= 4000
      ) {
        return {
          ok: true as const,
          reason: "composer-cleared-send-disabled" as const,
        };
      }
      // We already saw Stop earlier in this wait; generation finished (or UI
      // dropped Stop) without a detectable user bubble — still treat as sent.
      if (sawStop && Date.now() - startedAt >= 2500) {
        return {
          ok: true as const,
          reason: "saw-stop-earlier" as const,
        };
      }

      return {
        ok: false as const,
        userCount,
        assistantCount,
        stopVisible,
        composerEmpty,
        sendEnabled,
        sawStop,
      };
    };

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (this.abortChecker?.()) {
        await this.clickStopIfVisible();
        throw new BrowserAutomationError("Script Writer Batch canceled.", {
          code: "canceled",
        });
      }

      const state = await submissionState();
      if (state.ok) {
        console.info("[chatgpt-browser] user message submitted", {
          reason: state.reason,
          userBaselineCount,
          assistantBaselineCount,
          usedAttachment,
        });
        return;
      }
      await this.sleepUnlessAborted(500);
    }

    if (this.abortChecker?.()) {
      await this.clickStopIfVisible();
      throw new BrowserAutomationError("Script Writer Batch canceled.", {
        code: "canceled",
      });
    }

    // Final check before retry — generation may already be underway.
    const beforeRetry = await submissionState();
    if (beforeRetry.ok) {
      console.info("[chatgpt-browser] user message submitted", {
        reason: beforeRetry.reason,
        phase: "pre-retry",
        usedAttachment,
      });
      return;
    }

    console.warn(
      "[chatgpt-browser] send did not create a new user message; retrying carefully",
      beforeRetry,
    );

    const composerText = await this.readComposerText();
    const sendEnabled = await this.isSendButtonEnabled();
    if (sendEnabled && composerText.trim()) {
      await this.clickSend();
      await this.sleepUnlessAborted(1500);
      await this.page.keyboard.press("Enter");
      await this.sleepUnlessAborted(2500);
    } else if (sendEnabled) {
      await this.page.keyboard.press("Enter");
      await this.sleepUnlessAborted(2500);
    } else {
      // Do not hard-fail yet: Send disabled + empty composer often means the
      // first click already started the turn. Wait a bit longer for evidence.
      console.warn(
        "[chatgpt-browser] Send disabled on retry — waiting for in-flight generation evidence",
      );
      const softDeadline = Date.now() + (usedAttachment ? 45000 : 20000);
      while (Date.now() < softDeadline) {
        const state = await submissionState();
        if (state.ok) {
          console.info("[chatgpt-browser] user message submitted", {
            reason: state.reason,
            phase: "soft-wait",
            usedAttachment,
          });
          return;
        }
        if (state.assistantCount > assistantBaselineCount) {
          console.info("[chatgpt-browser] user message submitted", {
            reason: "assistant-advanced-during-soft-wait",
            usedAttachment,
          });
          return;
        }
        await this.sleepUnlessAborted(500);
      }
    }

    const finalState = await submissionState();
    if (finalState.ok) {
      console.info("[chatgpt-browser] user message submitted", {
        reason: finalState.reason,
        phase: "final",
        usedAttachment,
      });
      return;
    }

    if (sawStop || finalState.stopVisible) {
      console.info("[chatgpt-browser] user message submitted", {
        reason: "stop-observed-despite-missing-bubbles",
        phase: "final",
        usedAttachment,
        sawStop,
        stopVisible: finalState.stopVisible,
      });
      return;
    }

    if (
      finalState.userCount <= userBaselineCount &&
      finalState.assistantCount <= assistantBaselineCount &&
      !finalState.stopVisible
    ) {
      throw new BrowserAutomationError(
        "ChatGPT did not accept the prompt (no new user/assistant message after Send). Check the composer and retry.",
        { code: "provider_error", requiresUserAction: true },
      );
    }
  }

  private async clickSend() {
    if (!this.page) {
      throw new Error("ChatGPT session is not open.");
    }

    const enabled = await this.waitForSendEnabled(10000, {
      required: true,
      context: "clickSend",
    });
    if (!enabled) {
      throw new BrowserAutomationError(
        "ChatGPT Send button stayed disabled before clickSend.",
        { code: "provider_error", requiresUserAction: true },
      );
    }

    for (const selector of SEND_SELECTORS) {
      const count = await this.page.locator(selector).count();
      if (count === 0) {
        continue;
      }

      try {
        const button = this.page.locator(selector).first();
        const disabled = await button.isDisabled?.();
        if (disabled) {
          continue;
        }
        await button.click({ timeout: 5000 });
        console.info("[chatgpt-browser] clicked send", { selector });
        return;
      } catch {
        // try next
      }
    }

    // Only fall back to Enter when Send is enabled but click selectors missed.
    if (!(await this.isSendButtonEnabled())) {
      throw new BrowserAutomationError(
        "ChatGPT Send stayed disabled and no clickable send control was found. Check the composer attachment/upload state and retry.",
        { code: "provider_error", requiresUserAction: true },
      );
    }

    console.info("[chatgpt-browser] send fallback via Enter");
    await this.page.keyboard.press("Enter");
  }

  private async sleepUnlessAborted(ms: number) {
    if (!this.page) {
      return;
    }

    const deadline = Date.now() + Math.max(0, ms);
    while (Date.now() < deadline) {
      if (this.abortChecker?.()) {
        await this.clickStopIfVisible();
        throw new BrowserAutomationError("Script Writer Batch canceled.", {
          code: "canceled",
        });
      }
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        break;
      }
      await this.page.waitForTimeout(Math.min(200, remaining));
    }
  }

  private async clickStopIfVisible() {
    if (!this.page) {
      return;
    }

    for (const selector of STOP_SELECTORS) {
      const locator = this.page.locator(selector).first();
      const count = await this.page.locator(selector).count();
      if (count <= 0) {
        continue;
      }
      try {
        await locator.click({ timeout: 1500 });
        await this.page.waitForTimeout(400);
        return;
      } catch {
        // try next selector
      }
    }
  }

  private async findFirstVisible(selectors: string[], timeoutMs: number) {
    if (!this.page) {
      throw new Error("ChatGPT session is not open.");
    }

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      for (const selector of selectors) {
        const count = await this.page.locator(selector).count();
        if (count > 0) {
          return selector;
        }
      }
      await this.page.waitForTimeout(400);
    }

    throw new BrowserSelectorNotFoundError(
      `None of the selectors matched: ${selectors.join(", ")}`,
    );
  }

  private async isAnyVisible(selectors: string[]) {
    if (!this.page) {
      return false;
    }

    for (const selector of selectors) {
      const count = await this.page.locator(selector).count();
      if (count > 0) {
        return true;
      }
    }

    return false;
  }
}
