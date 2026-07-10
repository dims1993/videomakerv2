ALTER TABLE "Scene" ADD COLUMN "imageStatus" TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "Scene" ADD COLUMN "imageLocalPath" TEXT;
ALTER TABLE "Scene" ADD COLUMN "imageError" TEXT;
ALTER TABLE "Scene" ADD COLUMN "imageBatchId" TEXT;
ALTER TABLE "Scene" ADD COLUMN "imageFileName" TEXT;

CREATE TABLE "ImageBatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "videoId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'prepared',
    "parallelCount" INTEGER NOT NULL DEFAULT 1,
    "outputFolder" TEXT NOT NULL,
    "payloadPath" TEXT,
    "logsJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ImageBatch_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "Scene_imageBatchId_idx" ON "Scene"("imageBatchId");
CREATE INDEX "ImageBatch_videoId_idx" ON "ImageBatch"("videoId");
