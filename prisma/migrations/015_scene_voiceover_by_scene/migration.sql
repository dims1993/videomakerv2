ALTER TABLE "Scene" ADD COLUMN "voiceoverStatus" TEXT DEFAULT 'none';
ALTER TABLE "Scene" ADD COLUMN "voiceoverLocalPath" TEXT;
ALTER TABLE "Scene" ADD COLUMN "voiceoverFileName" TEXT;
ALTER TABLE "Scene" ADD COLUMN "voiceoverDuration" REAL;
ALTER TABLE "Scene" ADD COLUMN "voiceoverError" TEXT;
ALTER TABLE "Scene" ADD COLUMN "voiceoverProvider" TEXT;
ALTER TABLE "Scene" ADD COLUMN "voiceoverSettingsJson" JSONB;
ALTER TABLE "Scene" ADD COLUMN "pauseAfterMs" INTEGER;
