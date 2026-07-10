CREATE TABLE "TopicIdea" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "channelKey" TEXT NOT NULL,
  "category" TEXT,
  "title" TEXT NOT NULL,
  "topic" TEXT NOT NULL,
  "angle" TEXT,
  "trigger" TEXT,
  "promise" TEXT,
  "visualHook" TEXT,
  "status" TEXT NOT NULL DEFAULT 'idea',
  "source" TEXT,
  "notes" TEXT,
  "createdVideoId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE INDEX "TopicIdea_channelKey_idx" ON "TopicIdea"("channelKey");
CREATE INDEX "TopicIdea_category_idx" ON "TopicIdea"("category");
CREATE INDEX "TopicIdea_status_idx" ON "TopicIdea"("status");
