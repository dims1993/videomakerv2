PRAGMA foreign_keys=OFF;

CREATE TABLE "Video_new" (
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

INSERT INTO "Video_new" (
  "id",
  "topic",
  "title",
  "ideaJson",
  "status",
  "script",
  "metadataJson",
  "createdAt",
  "updatedAt"
)
SELECT
  "id",
  "topic",
  "title",
  CASE
    WHEN "angle" IS NULL OR trim("angle") = '' THEN NULL
    ELSE json_object(
      'rawIdea', "topic",
      'workingTitle', "title",
      'coreAngle', "angle",
      'viewerProblem', '',
      'emotionalHook', '',
      'centralQuestion', '',
      'mainPromise', '',
      'simpleThesis', '',
      'whyNow', '',
      'visualAnchor', '',
      'titleOptions', json_array(),
      'thumbnailConcepts', json_array(),
      'scriptDirection', json_object(),
      'avoid', json_array()
    )
  END,
  "status",
  "script",
  "metadataJson",
  "createdAt",
  "updatedAt"
FROM "Video";

DROP TABLE "Video";
ALTER TABLE "Video_new" RENAME TO "Video";

CREATE TABLE "Scene_new" (
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

INSERT INTO "Scene_new" (
  "id",
  "videoId",
  "order",
  "scriptText",
  "sceneType",
  "visualPurpose",
  "visualIdea",
  "imagePrompt",
  "duration",
  "imageUrl",
  "status",
  "createdAt",
  "updatedAt"
)
SELECT
  "id",
  "videoId",
  "order",
  "scriptText",
  "sceneType",
  NULL,
  "visualIdea",
  "imagePrompt",
  "duration",
  "imageUrl",
  "status",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Scene";

DROP TABLE "Scene";
ALTER TABLE "Scene_new" RENAME TO "Scene";

CREATE INDEX "Scene_videoId_idx" ON "Scene" ("videoId");
CREATE UNIQUE INDEX "Scene_videoId_order_key" ON "Scene" ("videoId", "order");

PRAGMA foreign_keys=ON;
