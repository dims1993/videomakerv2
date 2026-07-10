ALTER TABLE "Video" ADD COLUMN "thumbnailStatus" TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "Video" ADD COLUMN "thumbnailConceptJson" JSONB;
ALTER TABLE "Video" ADD COLUMN "thumbnailVariationsJson" JSONB;
ALTER TABLE "Video" ADD COLUMN "thumbnailPrompt" TEXT;
ALTER TABLE "Video" ADD COLUMN "thumbnailNegativePrompt" TEXT;
ALTER TABLE "Video" ADD COLUMN "thumbnailImagePath" TEXT;
ALTER TABLE "Video" ADD COLUMN "thumbnailImageUrl" TEXT;
ALTER TABLE "Video" ADD COLUMN "thumbnailFileName" TEXT;
ALTER TABLE "Video" ADD COLUMN "thumbnailNotes" TEXT;
