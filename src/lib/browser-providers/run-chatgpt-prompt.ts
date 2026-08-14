import path from "node:path";

import { getBrowserModelProvider } from "@/lib/browser-providers/registry";
import { BrowserAutomationError } from "@/lib/browser-automation/errors";
import {
  hashPrompt,
  type BrowserExpectReplyKind,
  type BrowserGeneratedImage,
} from "@/lib/browser-automation/types";
import { prisma } from "@/lib/prisma";

export class ChatGptPromptRunError extends Error {
  readonly rawText: string | null;

  constructor(message: string, rawText: string | null = null) {
    super(message);
    this.name = "ChatGptPromptRunError";
    this.rawText = rawText;
  }
}

function resolveProviderKey(explicit?: string) {
  return (
    explicit?.trim() ||
    process.env.SCRIPT_BATCH_PROVIDER?.trim() ||
    process.env.TOPIC_BATCH_PROVIDER?.trim() ||
    process.env.BROWSER_MODEL_PROVIDER?.trim() ||
    "chatgpt"
  );
}

function resolveCdpUrl() {
  return (
    process.env.CHATGPT_CDP_URL?.trim() ||
    process.env.GOOGLE_FLOW_CDP_URL?.trim() ||
    process.env.GOOGLE_FLOW_CHROME_CDP_URL?.trim() ||
    "http://127.0.0.1:9222"
  );
}

async function openProviderSession(providerKey: string, timeoutMs?: number) {
  const provider = getBrowserModelProvider(providerKey);
  const settings = await prisma.browserAutomationSettings.findUnique({
    where: { id: "default" },
  });

  const profileDir =
    settings?.profileDir?.trim() ||
    path.join(process.cwd(), "storage", "browser-profiles", "chatgpt");
  const cdpUrl = settings?.cdpUrl?.trim() || resolveCdpUrl();
  const resolvedTimeoutMs = timeoutMs ?? settings?.timeoutMs ?? 300000;
  const launchMode =
    providerKey === "fake"
      ? "persistent_context"
      : ((settings?.launchMode as "persistent_context" | "connect_cdp" | undefined) ??
        "connect_cdp");

  await provider.openSession({
    profileDir,
    cdpUrl,
    headful: settings?.headful ?? true,
    launchMode,
    timeoutMs: resolvedTimeoutMs,
  });

  const sessionCheck = await provider.checkSession();
  if (sessionCheck.requiresUserAction || !sessionCheck.authenticated) {
    throw new BrowserAutomationError(
      sessionCheck.message ||
        "ChatGPT browser session needs manual Google login in Chrome CDP.",
      { code: "needs_user_action", requiresUserAction: true },
    );
  }

  return { provider, timeoutMs: resolvedTimeoutMs };
}

async function sendAndExtract(
  provider: ReturnType<typeof getBrowserModelProvider>,
  input: {
    jobId: string;
    prompt: string;
    conversationMode: "new" | "continue";
    conversationId?: string;
    conversationStartUrl?: string;
    expectReplyKind?: BrowserExpectReplyKind;
  },
) {
  const submission = await provider.submitPrompt(input);
  const completion = await provider.waitForCompletion(submission);
  const extracted = await provider.extractResponse(completion);

  if (extracted.requiresUserAction) {
    throw new BrowserAutomationError(
      extracted.userActionMessage || "ChatGPT needs manual action.",
      { code: "needs_user_action", requiresUserAction: true },
    );
  }

  if (extracted.providerError) {
    throw new ChatGptPromptRunError(
      extracted.providerError,
      extracted.text || null,
    );
  }

  const text = extracted.text?.trim() || extracted.jsonText?.trim() || "";
  if (!text) {
    throw new ChatGptPromptRunError("ChatGPT returned an empty response.");
  }

  return {
    text,
    conversationId: submission.conversationId,
  };
}

/**
 * Send a full prompt to ChatGPT via Chrome CDP (or Fake) and return the assistant text.
 */
export async function runChatGptPromptViaBrowser({
  prompt,
  jobId,
  providerKey: explicitProviderKey,
  timeoutMs: explicitTimeoutMs,
}: {
  prompt: string;
  jobId: string;
  providerKey?: string;
  timeoutMs?: number;
}) {
  const turns = await runChatGptTurnsViaBrowser({
    turns: [prompt],
    jobId,
    providerKey: explicitProviderKey,
    timeoutMs: explicitTimeoutMs,
  });

  return {
    text: turns.texts[0]!,
    providerKey: turns.providerKey,
    promptHash: turns.promptHash,
  };
}

/**
 * Send one or more prompts in the same ChatGPT conversation.
 * The first turn opens a new chat; later turns continue it.
 */
export async function runChatGptTurnsViaBrowser({
  turns,
  jobId,
  providerKey: explicitProviderKey,
  timeoutMs: explicitTimeoutMs,
}: {
  turns: string[];
  jobId: string;
  providerKey?: string;
  timeoutMs?: number;
}) {
  const cleaned = turns.map((turn) => turn.trim()).filter(Boolean);
  if (cleaned.length === 0) {
    throw new Error("No prompts to send.");
  }

  const providerKey = resolveProviderKey(explicitProviderKey);
  const { provider } = await openProviderSession(providerKey, explicitTimeoutMs);

  try {
    const texts: string[] = [];
    let conversationId: string | undefined;

    for (let index = 0; index < cleaned.length; index += 1) {
      const prompt = cleaned[index]!;
      const result = await sendAndExtract(provider, {
        jobId: `${jobId}-turn-${index + 1}`,
        prompt,
        conversationMode: index === 0 ? "new" : "continue",
        conversationId,
      });
      conversationId = result.conversationId;
      texts.push(result.text);
    }

    return {
      texts,
      providerKey,
      promptHash: hashPrompt(cleaned.join("\n---\n")),
      conversationId: conversationId ?? null,
    };
  } finally {
    await provider.closeSession?.();
  }
}

/**
 * Keep a ChatGPT browser session open and send turns dynamically
 * (e.g. script → score → optional V2).
 */
export async function withChatGptBrowserTurns<T>({
  jobId,
  providerKey: explicitProviderKey,
  timeoutMs: explicitTimeoutMs,
  conversationStartUrl,
  shouldAbort,
  run,
}: {
  jobId: string;
  providerKey?: string;
  timeoutMs?: number;
  /** Used on the first "new" conversation turn (e.g. a ChatGPT project chat). */
  conversationStartUrl?: string | null;
  shouldAbort?: () => boolean;
  run: (helpers: {
    send: (
      prompt: string,
      options?: {
        freshConversation?: boolean;
        expectReplyKind?: BrowserExpectReplyKind;
      },
    ) => Promise<string>;
    downloadLatestImage: (options?: {
      timeoutMs?: number;
    }) => Promise<BrowserGeneratedImage>;
    providerKey: string;
  }) => Promise<T>;
}) {
  const providerKey = resolveProviderKey(explicitProviderKey);
  const { provider } = await openProviderSession(providerKey, explicitTimeoutMs);

  provider.setAbortChecker?.(shouldAbort ? () => Boolean(shouldAbort()) : null);

  try {
    let conversationId: string | undefined;
    let turnIndex = 0;
    const startUrl = conversationStartUrl?.trim() || undefined;

    const send = async (
      prompt: string,
      options?: {
        freshConversation?: boolean;
        expectReplyKind?: BrowserExpectReplyKind;
      },
    ) => {
      if (shouldAbort?.()) {
        throw new BrowserAutomationError("Script Writer Batch canceled.", {
          code: "canceled",
        });
      }

      const trimmed = prompt.trim();
      if (!trimmed) {
        throw new Error("Prompt is empty.");
      }

      turnIndex += 1;
      const fresh =
        turnIndex === 1 || Boolean(options?.freshConversation);
      if (fresh) {
        conversationId = undefined;
      }
      const result = await sendAndExtract(provider, {
        jobId: `${jobId}-turn-${turnIndex}`,
        prompt: trimmed,
        conversationMode: fresh ? "new" : "continue",
        conversationId,
        conversationStartUrl: fresh ? startUrl : undefined,
        expectReplyKind: options?.expectReplyKind,
      });
      conversationId = result.conversationId;
      return result.text;
    };

    const downloadLatestImage = async (options?: { timeoutMs?: number }) => {
      if (shouldAbort?.()) {
        throw new BrowserAutomationError("Thumbnail batch canceled.", {
          code: "canceled",
        });
      }
      if (typeof provider.downloadLatestGeneratedImage !== "function") {
        throw new Error(
          `Provider “${providerKey}” cannot download ChatGPT-generated images.`,
        );
      }
      return provider.downloadLatestGeneratedImage(options);
    };

    return await run({ send, downloadLatestImage, providerKey });
  } finally {
    provider.setAbortChecker?.(null);
    await provider.closeSession?.();
  }
}
