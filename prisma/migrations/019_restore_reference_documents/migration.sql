-- Restore ReferenceDocument for script-writer transcript references.
-- Editorial automation tables stay dropped.

CREATE TABLE IF NOT EXISTS "ReferenceDocument" (
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

CREATE UNIQUE INDEX IF NOT EXISTS "ReferenceDocument_channelKey_contentHash_key"
  ON "ReferenceDocument"("channelKey", "contentHash");

CREATE INDEX IF NOT EXISTS "ReferenceDocument_channelKey_isActive_idx"
  ON "ReferenceDocument"("channelKey", "isActive");

CREATE INDEX IF NOT EXISTS "ReferenceDocument_videoId_idx"
  ON "ReferenceDocument"("videoId");
