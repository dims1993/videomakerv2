import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export const PROCESS_STATUSES = [
  "idle",
  "queued",
  "running",
  "waiting",
  "success",
  "failed",
  "cancelled",
] as const;

export type ProcessStatus = (typeof PROCESS_STATUSES)[number];

export type ProcessLogLevel = "info" | "warning" | "error" | "success";

export type ProcessLogItem = {
  timestamp: string;
  level: ProcessLogLevel;
  message: string;
};

export type StartProcessInput = {
  type: string;
  videoId?: string | null;
  channelKey?: string | null;
  title: string;
  description?: string | null;
  currentStep?: string | null;
  totalSteps?: number | null;
};

export type UpdateProcessInput = {
  status?: ProcessStatus;
  currentStep?: string | null;
  stepIndex?: number;
  totalSteps?: number | null;
  progressPercent?: number | null;
  logMessage?: string;
  logLevel?: ProcessLogLevel;
  result?: unknown;
};

const MAX_PROCESS_LOGS = 50;

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeProgress({
  progressPercent,
  stepIndex,
  totalSteps,
}: {
  progressPercent?: number | null;
  stepIndex?: number;
  totalSteps?: number | null;
}) {
  if (typeof progressPercent === "number" && Number.isFinite(progressPercent)) {
    return clampPercent(progressPercent);
  }

  if (
    typeof stepIndex === "number" &&
    Number.isFinite(stepIndex) &&
    typeof totalSteps === "number" &&
    totalSteps > 0
  ) {
    return clampPercent((stepIndex / totalSteps) * 100);
  }

  return undefined;
}

function parseLogs(value: unknown): ProcessLogItem[] {
  return Array.isArray(value) ? (value as ProcessLogItem[]) : [];
}

function jsonValue(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) {
    return undefined;
  }

  return value as Prisma.InputJsonValue;
}

async function appendProcessLog(
  processId: string,
  message: string,
  level: ProcessLogLevel = "info",
) {
  const process = await prisma.processRun.findUnique({
    where: { id: processId },
    select: { logsJson: true },
  });

  if (!process) {
    return;
  }

  const logs = parseLogs(process.logsJson);
  const nextLogs = [
    ...logs,
    {
      timestamp: new Date().toISOString(),
      level,
      message,
    },
  ].slice(-MAX_PROCESS_LOGS);

  await prisma.processRun.update({
    where: { id: processId },
    data: { logsJson: nextLogs as Prisma.InputJsonValue },
  });
}

export async function startProcess({
  type,
  videoId,
  channelKey,
  title,
  description,
  currentStep = "Starting",
  totalSteps,
}: StartProcessInput) {
  const process = await prisma.processRun.create({
    data: {
      type,
      videoId: videoId ?? null,
      channelKey: channelKey ?? null,
      title,
      description: description ?? null,
      status: "running",
      currentStep,
      totalSteps: totalSteps ?? null,
      progressPercent: totalSteps ? 1 : null,
      logsJson: [
        {
          timestamp: new Date().toISOString(),
          level: "info",
          message: currentStep ?? "Started",
        },
      ] as Prisma.InputJsonValue,
    },
  });

  return process.id;
}

const TERMINAL_PROCESS_STATUSES = new Set(["success", "failed", "cancelled"]);

export async function updateProcess(
  processId: string | null | undefined,
  input: UpdateProcessInput,
) {
  if (!processId) {
    return;
  }

  const existing = await prisma.processRun.findUnique({
    where: { id: processId },
    select: { status: true },
  });

  // Never revive a finished/cancelled run (e.g. cancel API marked cancelled
  // while a long loop still calls updateProcess with status: "running").
  if (existing && TERMINAL_PROCESS_STATUSES.has(existing.status)) {
    if (input.logMessage) {
      await appendProcessLog(processId, input.logMessage, input.logLevel);
    }
    return;
  }

  const progressPercent = normalizeProgress(input);
  const data: Prisma.ProcessRunUpdateInput = {
    ...(input.status ? { status: input.status } : {}),
    ...(input.currentStep !== undefined ? { currentStep: input.currentStep } : {}),
    ...(input.totalSteps !== undefined ? { totalSteps: input.totalSteps } : {}),
    ...(progressPercent !== undefined ? { progressPercent } : {}),
    ...(input.result !== undefined ? { resultJson: jsonValue(input.result) } : {}),
  };

  await prisma.processRun.update({
    where: { id: processId },
    data,
  });

  if (input.logMessage) {
    await appendProcessLog(processId, input.logMessage, input.logLevel);
  }
}

export async function finishProcess(
  processId: string | null | undefined,
  input: { result?: unknown; logMessage?: string } = {},
) {
  if (!processId) {
    return;
  }

  await prisma.processRun.update({
    where: { id: processId },
    data: {
      status: "success",
      currentStep: "Done",
      progressPercent: 100,
      resultJson: jsonValue(input.result),
      finishedAt: new Date(),
      errorMessage: null,
    },
  });

  await appendProcessLog(processId, input.logMessage ?? "Completed", "success");
}

export async function failProcess(
  processId: string | null | undefined,
  input: { errorMessage: string; logMessage?: string },
) {
  if (!processId) {
    return;
  }

  await prisma.processRun.update({
    where: { id: processId },
    data: {
      status: "failed",
      errorMessage: input.errorMessage,
      finishedAt: new Date(),
    },
  });

  await appendProcessLog(processId, input.logMessage ?? input.errorMessage, "error");
}

export async function cancelProcess(processId: string | null | undefined) {
  if (!processId) {
    return;
  }

  await prisma.processRun.update({
    where: { id: processId },
    data: {
      status: "cancelled",
      currentStep: "Cancelled",
      finishedAt: new Date(),
    },
  });

  await appendProcessLog(processId, "Cancelled", "warning");
}

export async function listProcessRuns({
  videoId,
  includeGlobal = false,
  limit = 8,
}: {
  videoId?: string | null;
  includeGlobal?: boolean;
  limit?: number;
}) {
  return prisma.processRun.findMany({
    where: videoId
      ? includeGlobal
        ? { OR: [{ videoId }, { videoId: null }] }
        : { videoId }
      : undefined,
    orderBy: [{ updatedAt: "desc" }],
    take: limit,
  });
}
