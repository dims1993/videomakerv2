CREATE TABLE "ProcessRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL DEFAULT 'generic',
    "videoId" TEXT,
    "channelKey" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "currentStep" TEXT,
    "totalSteps" INTEGER,
    "progressPercent" REAL,
    "logsJson" JSONB,
    "resultJson" JSONB,
    "errorMessage" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "finishedAt" DATETIME,
    CONSTRAINT "ProcessRun_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ProcessRun_videoId_idx" ON "ProcessRun"("videoId");
CREATE INDEX "ProcessRun_status_idx" ON "ProcessRun"("status");
CREATE INDEX "ProcessRun_type_idx" ON "ProcessRun"("type");
CREATE INDEX "ProcessRun_updatedAt_idx" ON "ProcessRun"("updatedAt");
