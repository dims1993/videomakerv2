-- AlterTable
ALTER TABLE "Scene" ADD COLUMN "clipLocalPath" TEXT;
ALTER TABLE "Scene" ADD COLUMN "clipFileName" TEXT;
ALTER TABLE "Scene" ADD COLUMN "clipMuted" BOOLEAN NOT NULL DEFAULT true;
