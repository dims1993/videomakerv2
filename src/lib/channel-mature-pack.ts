import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ChannelPipelineMode } from "@/lib/channels";
import { createReferenceDocument } from "@/lib/reference-documents";

export type MaturePackRegistration = {
  saved: string[];
  skipped: string[];
  warnings: string[];
};

function isFile(value: FormDataEntryValue | null): value is File {
  return Boolean(value && typeof value === "object" && "arrayBuffer" in value);
}

async function readUploadText(file: File) {
  const buffer = Buffer.from(await file.arrayBuffer());
  return buffer.toString("utf8").trim();
}

async function writeUploadText(relativePath: string, contents: string) {
  const absolute = path.join(process.cwd(), relativePath);
  await mkdir(path.dirname(absolute), { recursive: true });
  const body = contents.endsWith("\n") ? contents : `${contents}\n`;
  await writeFile(absolute, body, "utf8");
}

async function writeUploadBinary(relativePath: string, file: File) {
  const absolute = path.join(process.cwd(), relativePath);
  await mkdir(path.dirname(absolute), { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(absolute, buffer);
}

function safeFileBase(name: string, fallback: string) {
  const cleaned = name
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned || fallback;
}

async function maybeOverwriteDoc({
  formData,
  field,
  relativePath,
  label,
  result,
}: {
  formData: FormData;
  field: string;
  relativePath: string;
  label: string;
  result: MaturePackRegistration;
}) {
  const entry = formData.get(field);
  if (!isFile(entry) || entry.size <= 0) {
    result.skipped.push(label);
    return;
  }
  const text = await readUploadText(entry);
  if (!text) {
    result.warnings.push(`${label}: uploaded file was empty.`);
    result.skipped.push(label);
    return;
  }
  await writeUploadText(relativePath, text);
  result.saved.push(`${label} → ${relativePath}`);
}

/**
 * After scaffolding stubs, optionally register mature-channel assets from the
 * create-channel form. All uploads are suggestions — missing files are fine.
 */
export async function registerChannelMaturePack({
  channelKey,
  channelName,
  pipelineMode,
  formData,
}: {
  channelKey: string;
  channelName: string;
  pipelineMode: ChannelPipelineMode;
  formData: FormData;
}): Promise<MaturePackRegistration> {
  const result: MaturePackRegistration = {
    saved: [],
    skipped: [],
    warnings: [],
  };

  const docsRoot = `docs/channels/${channelKey}`;
  const promptsRoot = `prompts/channels/${channelKey}`;
  const referencesRoot = `${docsRoot}/references`;
  const videoLibraryRoot = path.join(
    "data",
    "image-library",
    channelKey,
    "video-library",
  );

  await maybeOverwriteDoc({
    formData,
    field: "projectBibleFile",
    relativePath: `${docsRoot}/project-bible.md`,
    label: "Project Bible",
    result,
  });
  await maybeOverwriteDoc({
    formData,
    field: "characterBibleFile",
    relativePath: `${docsRoot}/character-bible.md`,
    label: "Character Bible",
    result,
  });
  await maybeOverwriteDoc({
    formData,
    field: "imagePromptBibleFile",
    relativePath: `${docsRoot}/image-prompt-bible.md`,
    label: "Image Prompt Bible",
    result,
  });

  await maybeOverwriteDoc({
    formData,
    field: "angleBuilderFile",
    relativePath: `${promptsRoot}/angle-builder.md`,
    label: "Angle Builder prompt",
    result,
  });
  await maybeOverwriteDoc({
    formData,
    field: "scriptWriterFile",
    relativePath: `${promptsRoot}/script-writer.md`,
    label: "Script Writer prompt",
    result,
  });
  await maybeOverwriteDoc({
    formData,
    field: "visualPlannerFile",
    relativePath: `${promptsRoot}/visual-planner.md`,
    label: "Visual Planner prompt",
    result,
  });
  await maybeOverwriteDoc({
    formData,
    field: "metadataWriterFile",
    relativePath: `${promptsRoot}/metadata-writer.md`,
    label: "Metadata Writer prompt",
    result,
  });

  // Editorial brief → docs note (full channels also seed topicSystem in scaffold).
  const editorialFile = formData.get("editorialBriefFile");
  const editorialPaste = formData.get("editorialBriefText")?.toString().trim() ?? "";
  if (isFile(editorialFile) && editorialFile.size > 0) {
    const text = await readUploadText(editorialFile);
    if (text) {
      await writeUploadText(`${docsRoot}/editorial-brief.md`, text);
      result.saved.push(`Editorial brief → ${docsRoot}/editorial-brief.md`);
    } else {
      result.skipped.push("Editorial + topics brief");
    }
  } else if (editorialPaste) {
    await writeUploadText(
      `${docsRoot}/editorial-brief.md`,
      `# ${channelName} — Editorial brief\n\n${editorialPaste}\n`,
    );
    result.saved.push(`Editorial brief → ${docsRoot}/editorial-brief.md`);
  } else {
    result.skipped.push("Editorial + topics brief");
  }

  // Host / set reference frames
  const hostFrames = formData
    .getAll("hostReferenceImages")
    .filter(isFile)
    .filter((file) => file.size > 0);
  if (hostFrames.length === 0) {
    result.skipped.push("Frames / stills de host");
  } else {
    await mkdir(path.join(process.cwd(), referencesRoot), { recursive: true });
    await writeUploadText(
      `${referencesRoot}/README.md`,
      [
        `# ${channelName} visual references`,
        "",
        "Human-only reference assets for host / set design.",
        "Generation stays text-descriptor based unless a later pipeline wires these files as conditioning.",
        "",
      ].join("\n"),
    );
    let index = 0;
    for (const file of hostFrames) {
      index += 1;
      const ext = path.extname(file.name) || ".png";
      const base = safeFileBase(
        path.basename(file.name, ext),
        `reference-${index}`,
      );
      const relativePath = `${referencesRoot}/${base}${ext.toLowerCase()}`;
      await writeUploadBinary(relativePath, file);
      result.saved.push(`Host/set frame → ${relativePath}`);
    }
  }

  // Reference transcripts → Reference Library DB
  const transcriptFiles = formData
    .getAll("referenceTranscriptFiles")
    .filter(isFile)
    .filter((file) => file.size > 0);
  const transcriptPaste = formData.get("referenceTranscriptText")?.toString().trim() ?? "";
  const transcriptTitle =
    formData.get("referenceTranscriptTitle")?.toString().trim() ||
    `${channelName} reference transcript`;

  if (transcriptFiles.length === 0 && !transcriptPaste) {
    result.skipped.push("Transcripts de referencia");
  } else {
    for (const [i, file] of transcriptFiles.entries()) {
      const content = await readUploadText(file);
      if (!content) {
        result.warnings.push(`Transcript file "${file.name}" was empty.`);
        continue;
      }
      try {
        const doc = await createReferenceDocument({
          channelKey,
          type: "competitor_transcript",
          title: `${transcriptTitle}${transcriptFiles.length > 1 ? ` (${i + 1})` : ""}`,
          sourceName: file.name,
          content,
        });
        result.saved.push(`Transcript → Reference Library (${doc.title})`);
      } catch (error) {
        result.warnings.push(
          error instanceof Error
            ? error.message
            : `Could not save transcript ${file.name}`,
        );
      }
    }
    if (transcriptPaste) {
      try {
        const doc = await createReferenceDocument({
          channelKey,
          type: "competitor_transcript",
          title: transcriptTitle,
          sourceName: "pasted at channel create",
          content: transcriptPaste,
        });
        result.saved.push(`Transcript → Reference Library (${doc.title})`);
      } catch (error) {
        result.warnings.push(
          error instanceof Error
            ? error.message
            : "Could not save pasted transcript",
        );
      }
    }
  }

  // Video-library bumpers (especially useful for audio_only / podcast-like)
  const bumperFields: Array<{ field: string; fileName: string; label: string }> =
    [
      { field: "videoLibraryIntro", fileName: "INTRO.mov", label: "INTRO bumper" },
      { field: "videoLibraryLesson", fileName: "LESSON.mov", label: "LESSON bumper" },
      {
        field: "videoLibraryClosing",
        fileName: "CLOSING.mov",
        label: "CLOSING bumper",
      },
      { field: "videoLibraryFinal", fileName: "FINAL.mp4", label: "FINAL bumper" },
    ];

  let bumperSaved = 0;
  for (const bumper of bumperFields) {
    const entry = formData.get(bumper.field);
    if (!isFile(entry) || entry.size <= 0) {
      continue;
    }
    const ext = path.extname(entry.name).toLowerCase();
    const fileName =
      ext && [".mov", ".mp4", ".webm", ".m4v"].includes(ext)
        ? bumper.fileName.replace(/\.[^.]+$/, ext)
        : bumper.fileName;
    const relativePath = path.join(videoLibraryRoot, fileName);
    await writeUploadBinary(relativePath, entry);
    result.saved.push(`${bumper.label} → ${relativePath}`);
    bumperSaved += 1;
  }
  if (bumperSaved === 0) {
    result.skipped.push(
      pipelineMode === "audio_only"
        ? "Video-library bumpers (suggested for podcast-style)"
        : "Video-library bumpers",
    );
  }

  return result;
}
