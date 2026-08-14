-- CreateTable
CREATE TABLE "ReferenceDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "channelKey" TEXT NOT NULL,
    "videoId" TEXT,
    "type" TEXT NOT NULL DEFAULT 'competitor_transcript',
    "title" TEXT NOT NULL,
    "sourceName" TEXT,
    "sourceUrl" TEXT,
    "content" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "wordCount" INTEGER NOT NULL DEFAULT 0,
    "tagsJson" TEXT,
    "analysisJson" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ReferenceDocument_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EditorialAutomationRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "videoId" TEXT NOT NULL,
    "channelKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "providerKey" TEXT NOT NULL DEFAULT 'fake',
    "startStage" TEXT NOT NULL DEFAULT 'idea_builder',
    "endStage" TEXT NOT NULL DEFAULT 'idea_builder',
    "currentStage" TEXT,
    "currentOperation" TEXT,
    "configJson" TEXT NOT NULL,
    "championArtifactId" TEXT,
    "errorMessage" TEXT,
    "needsUserActionMsg" TEXT,
    "heartbeatAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EditorialAutomationRun_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BrowserBatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "concurrency" INTEGER NOT NULL DEFAULT 2,
    "totalJobs" INTEGER NOT NULL DEFAULT 0,
    "completedJobs" INTEGER NOT NULL DEFAULT 0,
    "failedJobs" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BrowserBatch_runId_fkey" FOREIGN KEY ("runId") REFERENCES "EditorialAutomationRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BrowserJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "batchId" TEXT,
    "videoId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "providerKey" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "promptHash" TEXT NOT NULL,
    "conversationId" TEXT,
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "rawResponse" TEXT,
    "parsedResponseJson" TEXT,
    "artifactVersionId" TEXT,
    "error" TEXT,
    "screenshotPath" TEXT,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BrowserJob_runId_fkey" FOREIGN KEY ("runId") REFERENCES "EditorialAutomationRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BrowserJob_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "BrowserBatch" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "BrowserJob_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ArtifactVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "candidateKey" TEXT,
    "parentId" TEXT,
    "contentText" TEXT,
    "contentJson" TEXT,
    "scoreTotal" REAL,
    "evaluationJson" TEXT,
    "isChampion" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ArtifactVersion_runId_fkey" FOREIGN KEY ("runId") REFERENCES "EditorialAutomationRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ArtifactVersion_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BrowserAutomationSettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "providerKey" TEXT NOT NULL DEFAULT 'fake',
    "profileDir" TEXT NOT NULL DEFAULT 'storage/browser-profiles/chatgpt',
    "cdpUrl" TEXT,
    "headful" BOOLEAN NOT NULL DEFAULT true,
    "maxConcurrency" INTEGER NOT NULL DEFAULT 2,
    "timeoutMs" INTEGER NOT NULL DEFAULT 180000,
    "launchMode" TEXT NOT NULL DEFAULT 'persistent_context',
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "ReferenceDocument_channelKey_contentHash_key" ON "ReferenceDocument"("channelKey", "contentHash");

-- CreateIndex
CREATE INDEX "ReferenceDocument_channelKey_isActive_idx" ON "ReferenceDocument"("channelKey", "isActive");

-- CreateIndex
CREATE INDEX "ReferenceDocument_videoId_idx" ON "ReferenceDocument"("videoId");

-- CreateIndex
CREATE INDEX "EditorialAutomationRun_videoId_status_idx" ON "EditorialAutomationRun"("videoId", "status");

-- CreateIndex
CREATE INDEX "EditorialAutomationRun_status_idx" ON "EditorialAutomationRun"("status");

-- CreateIndex
CREATE INDEX "BrowserBatch_runId_idx" ON "BrowserBatch"("runId");

-- CreateIndex
CREATE INDEX "BrowserBatch_status_idx" ON "BrowserBatch"("status");

-- CreateIndex
CREATE INDEX "BrowserJob_runId_status_idx" ON "BrowserJob"("runId", "status");

-- CreateIndex
CREATE INDEX "BrowserJob_batchId_idx" ON "BrowserJob"("batchId");

-- CreateIndex
CREATE INDEX "BrowserJob_videoId_idx" ON "BrowserJob"("videoId");

-- CreateIndex
CREATE INDEX "ArtifactVersion_runId_stage_idx" ON "ArtifactVersion"("runId", "stage");

-- CreateIndex
CREATE INDEX "ArtifactVersion_videoId_stage_idx" ON "ArtifactVersion"("videoId", "stage");
