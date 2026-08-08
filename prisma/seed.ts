import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const count = await prisma.video.count();

  if (count > 0) {
    return;
  }

  await prisma.video.create({
    data: {
      topic: "How small teams can ship better YouTube videos",
      title: "A Lean Video Production Pipeline",
      ideaJson: JSON.stringify(
        {
          rawIdea: "How small teams can ship better YouTube videos",
          workingTitle: "A Lean Video Production Pipeline",
          coreAngle: "Show a practical system for moving from raw idea to publish-ready metadata.",
          viewerProblem: "Video ideas slow down because every production step lives in a different place.",
          emotionalHook: "The video feels stuck before editing even starts.",
          centralQuestion: "What would a lightweight production system look like?",
          mainPromise: "A simple way to move a YouTube video from idea to assets and metadata.",
          simpleThesis: "Small teams ship faster when each production step has a clear place to live.",
          whyNow: "AI tools make generation easier, but the workflow around them still needs structure.",
          visualAnchor: "A production board moving from messy idea to organized publish package.",
          titleOptions: [
            "A Lean Video Production Pipeline",
            "How Small Teams Can Ship Better Videos",
            "Stop Losing Video Ideas Between Tools"
          ],
          thumbnailConcepts: [
            {
              text: "FROM IDEA TO READY",
              visual: "A messy notes pile becoming a clean production board"
            }
          ],
          scriptDirection: {
            opening: "Start with the hidden drag before editing.",
            middle: "Show the pipeline step by step.",
            ending: "Invite the viewer to build one repeatable workflow."
          },
          avoid: ["Overpromising automation", "Making the system feel complex"]
        },
        null,
        2
      ),
      status: "script",
      script: "Hook: Most video delays happen before editing starts.\n\nMain idea: Treat each video like a small production pipeline with clear scene planning and asset status.\n\nClose: Start with one repeatable workflow and improve it every week.",
      metadataJson: JSON.stringify(
        {
          description: "A practical walkthrough of a lightweight YouTube production workflow.",
          tags: ["youtube", "production", "workflow"],
          thumbnailIdea: "Split-screen of messy notes becoming a clean production board"
        },
        null,
        2
      ),
      scenes: {
        create: [
          {
            sortOrder: 1,
            scriptText: "Most video delays happen before editing starts.",
            sceneType: "avatar",
            visualPurpose: "Make the viewer feel the friction of a scattered production process.",
            visualIdea: "Fast montage of notes, timelines, and unfinished assets.",
            imagePrompt: "Clean editorial desk with video planning notes and production timeline",
            duration: 8,
            status: "planned"
          },
          {
            sortOrder: 2,
            scriptText: "A simple pipeline keeps every idea moving.",
            sceneType: "insert",
            visualPurpose: "Explain the core workflow as a clear sequence of production stages.",
            visualIdea: "Production stages laid out as a clear board.",
            imagePrompt: "Minimal Kanban board for YouTube video production pipeline",
            duration: 14,
            status: "planned"
          }
        ]
      }
    }
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
