import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { Prisma } from "@prisma/client";

import { BrowserAutomationError } from "@/lib/browser-automation/errors";
import { withChatGptBrowserTurns } from "@/lib/browser-providers/run-chatgpt-prompt";
import { getChannelProfile } from "@/lib/channels-server";
import { finishProcess, failProcess, startProcess, updateProcess } from "@/lib/process-runs";
import { prisma } from "@/lib/prisma";
import {
  ThumbnailBatchCanceledError,
  clearThumbnailBatchCancel,
  isThumbnailBatchCancelRequested,
} from "@/lib/thumbnail-batch-cancel";
import {
  buildThumbnailImageGeneratePrompt,
  buildThumbnailResolvePrompt,
  extractResolvedThumbnailPrompt,
  parseVideoThumbnailMasterSelection,
} from "@/lib/thumbnail-batch-prompt";
import {
  getDefaultThumbnailPromptMaster,
  getThumbnailPromptMaster,
} from "@/lib/thumbnail-prompt-masters";

export class ThumbnailBatchRunError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ThumbnailBatchRunError";
  }
}

function extensionForContentType(contentType: string) {
  const lower = contentType.toLowerCase();
  if (lower.includes("jpeg") || lower.includes("jpg")) {
    return ".jpg";
  }
  if (lower.includes("webp")) {
    return ".webp";
  }
  return ".png";
}

export async function runThumbnailBatchViaBrowser({
  videoId,
  masterId,
}: {
  videoId: string;
  masterId?: string | null;
}) {
  clearThumbnailBatchCancel(videoId);

  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: {
      id: true,
      title: true,
      channelKey: true,
      thumbnailConceptJson: true,
    },
  });
  if (!video) {
    throw new ThumbnailBatchRunError("Video not found.");
  }

  const selection = parseVideoThumbnailMasterSelection(video.thumbnailConceptJson);
  const requestedMasterId = masterId?.trim() || selection?.masterId || null;

  const master = requestedMasterId
    ? await getThumbnailPromptMaster(video.channelKey, requestedMasterId)
    : await getDefaultThumbnailPromptMaster(video.channelKey);

  if (!master) {
    throw new ThumbnailBatchRunError(
      "No thumbnail prompt master selected. Save a master for this channel and set one as default (or select one for this video).",
    );
  }

  const processId = await startProcess({
    type: "thumbnail_generation",
    videoId,
    title: "Thumbnail batch (ChatGPT)",
    totalSteps: 4,
    currentStep: "Resolving prompt master variables",
  });

  try {
    const assertNotCanceled = () => {
      if (isThumbnailBatchCancelRequested(videoId)) {
        throw new ThumbnailBatchCanceledError();
      }
    };

    const channel = getChannelProfile(video.channelKey);
    const conversationStartUrl =
      channel.chatgptThumbnailConversationUrl?.trim() || null;

    const result = await withChatGptBrowserTurns({
      jobId: `thumbnail-${videoId}`,
      timeoutMs: 900_000,
      conversationStartUrl,
      shouldAbort: () => isThumbnailBatchCancelRequested(videoId),
      run: async ({ send, downloadLatestImage, providerKey }) => {
        assertNotCanceled();
        await updateProcess(processId, {
          currentStep: "ChatGPT: resolve master prompt",
          stepIndex: 1,
          totalSteps: 4,
        });

        const resolveRaw = await send(
          buildThumbnailResolvePrompt({
            masterPrompt: master.prompt,
            videoTitle: video.title,
          }),
        );
        const { resolvedPrompt, notes } = extractResolvedThumbnailPrompt(resolveRaw);

        await prisma.video.update({
          where: { id: videoId },
          data: {
            thumbnailConceptJson: {
              kind: "master",
              masterId: master.id,
              masterName: master.name,
            } as Prisma.InputJsonValue,
            thumbnailPrompt: resolvedPrompt,
            thumbnailNotes: notes,
            thumbnailStatus: "prompt_ready",
          },
        });

        assertNotCanceled();
        await updateProcess(processId, {
          currentStep: "ChatGPT: generate thumbnail image",
          stepIndex: 2,
          totalSteps: 4,
        });

        await send(buildThumbnailImageGeneratePrompt(resolvedPrompt));

        assertNotCanceled();
        await updateProcess(processId, {
          currentStep: "Downloading generated image",
          stepIndex: 3,
          totalSteps: 4,
        });

        const image = await downloadLatestImage({ timeoutMs: 600_000 });
        const ext = extensionForContentType(image.contentType);
        const fileName = `thumbnail-chatgpt-${Date.now()}${ext}`;
        const outputFolder = path.join(
          process.cwd(),
          "storage",
          "thumbnails",
          videoId,
        );
        const absolutePath = path.join(outputFolder, fileName);
        await mkdir(outputFolder, { recursive: true });
        await writeFile(absolutePath, image.bytes);

        const relativePath = path.relative(process.cwd(), absolutePath);
        const imageUrl = `/api/thumbnails/${encodeURIComponent(videoId)}/${encodeURIComponent(fileName)}`;

        await prisma.video.update({
          where: { id: videoId },
          data: {
            thumbnailFileName: fileName,
            thumbnailImagePath: relativePath,
            thumbnailImageUrl: imageUrl,
            thumbnailStatus: "image_imported",
          },
        });

        return {
          providerKey,
          resolvedPrompt,
          fileName,
          localPath: relativePath,
          imageUrl,
          sizeBytes: image.bytes.byteLength,
        };
      },
    });

    await finishProcess(processId, {
      result: {
        providerKey: result.providerKey,
        fileName: result.fileName,
        sizeBytes: result.sizeBytes,
        masterId: master.id,
      },
      logMessage: `Thumbnail saved (${result.fileName}).`,
    });

    return {
      videoId,
      masterId: master.id,
      masterName: master.name,
      ...result,
    };
  } catch (error) {
    if (
      error instanceof ThumbnailBatchCanceledError ||
      (error instanceof BrowserAutomationError && error.code === "canceled")
    ) {
      await failProcess(processId, {
        errorMessage: "Thumbnail batch canceled.",
      });
      throw new ThumbnailBatchCanceledError();
    }

    await failProcess(processId, {
      errorMessage:
        error instanceof Error
          ? error.message
          : "Thumbnail batch failed.",
    });
    throw error;
  } finally {
    clearThumbnailBatchCancel(videoId);
  }
}
