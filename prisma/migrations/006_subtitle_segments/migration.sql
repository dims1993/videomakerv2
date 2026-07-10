CREATE TABLE "SubtitleSegment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "videoId" TEXT NOT NULL,
    "voiceoverSegmentId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "sceneStartOrder" INTEGER NOT NULL,
    "sceneEndOrder" INTEGER NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'elevenlabs_forced_alignment',
    "rawAlignmentJson" JSONB,
    "localCuesJson" JSONB,
    "globalCuesJson" JSONB,
    "localSrt" TEXT,
    "globalSrt" TEXT,
    "localVtt" TEXT,
    "globalVtt" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SubtitleSegment_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SubtitleSegment_voiceoverSegmentId_fkey" FOREIGN KEY ("voiceoverSegmentId") REFERENCES "VoiceoverSegment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "SubtitleSegment_voiceoverSegmentId_key" ON "SubtitleSegment"("voiceoverSegmentId");
CREATE INDEX "SubtitleSegment_videoId_idx" ON "SubtitleSegment"("videoId");
CREATE INDEX "SubtitleSegment_voiceoverSegmentId_idx" ON "SubtitleSegment"("voiceoverSegmentId");
CREATE INDEX "SubtitleSegment_videoId_index_idx" ON "SubtitleSegment"("videoId", "index");
