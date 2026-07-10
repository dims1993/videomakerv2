ALTER TABLE "Video" ADD COLUMN "styledSubtitleJson" JSONB;
ALTER TABLE "Video" ADD COLUMN "styledSubtitleAss" TEXT;
ALTER TABLE "Video" ADD COLUMN "captionStylePreset" TEXT NOT NULL DEFAULT 'active_word_highlight';
