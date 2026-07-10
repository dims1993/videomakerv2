CREATE TABLE "VoiceoverSegment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "videoId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "sceneStartOrder" INTEGER NOT NULL,
    "sceneEndOrder" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'elevenlabs',
    "voiceId" TEXT,
    "modelId" TEXT,
    "outputFormat" TEXT DEFAULT 'mp3_44100_128',
    "audioPath" TEXT,
    "fileName" TEXT,
    "durationSec" REAL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VoiceoverSegment_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "VoiceoverSegment_videoId_idx" ON "VoiceoverSegment"("videoId");
CREATE INDEX "VoiceoverSegment_videoId_index_idx" ON "VoiceoverSegment"("videoId", "index");
CREATE INDEX "VoiceoverSegment_videoId_sceneStartOrder_idx" ON "VoiceoverSegment"("videoId", "sceneStartOrder");
