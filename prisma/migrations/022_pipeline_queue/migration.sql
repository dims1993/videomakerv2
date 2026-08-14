-- CreateTable
CREATE TABLE "PipelineQueueItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "videoId" TEXT NOT NULL,
    "channelKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "currentStep" TEXT NOT NULL DEFAULT 'script',
    "errorMessage" TEXT,
    "lastProcessRunId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    CONSTRAINT "PipelineQueueItem_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "PipelineQueueItem_status_idx" ON "PipelineQueueItem"("status");

-- CreateIndex
CREATE INDEX "PipelineQueueItem_enabled_status_sortOrder_idx" ON "PipelineQueueItem"("enabled", "status", "sortOrder");

-- CreateIndex
CREATE INDEX "PipelineQueueItem_videoId_idx" ON "PipelineQueueItem"("videoId");

-- CreateIndex
CREATE INDEX "PipelineQueueItem_channelKey_idx" ON "PipelineQueueItem"("channelKey");
