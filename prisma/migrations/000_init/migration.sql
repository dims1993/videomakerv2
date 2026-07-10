CREATE TABLE "Video" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "topic" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "ideaJson" TEXT,
  "status" TEXT NOT NULL DEFAULT 'idea',
  "script" TEXT,
  "metadataJson" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "Scene" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "videoId" TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  "scriptText" TEXT NOT NULL,
  "sceneType" TEXT NOT NULL,
  "visualPurpose" TEXT,
  "visualIdea" TEXT,
  "imagePrompt" TEXT,
  "duration" INTEGER,
  "imageUrl" TEXT,
  "status" TEXT NOT NULL DEFAULT 'planned',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Scene_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "Scene_videoId_idx" ON "Scene" ("videoId");

CREATE UNIQUE INDEX "Scene_videoId_order_key" ON "Scene" ("videoId", "order");
