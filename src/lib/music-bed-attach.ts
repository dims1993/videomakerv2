import { access, copyFile, mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { getAudioDurationSec } from "@/lib/audio";
import {
  downloadFreesoundPreview,
  findFreesoundBedHit,
  FreesoundError,
  pickFreesoundPreviewUrl,
} from "@/lib/freesound";
import type { MusicBedAttachSettings, MusicBedPreset } from "@/lib/music-beds";
import {
  inferMusicBedCueKind,
  musicBedCachePath,
  musicBedLibraryDir,
  musicBedLocalOverrideExists,
  musicBedLocalOverridePath,
  MUSIC_BED_MIN_INTRO_SEC,
  MUSIC_BED_PROVIDER,
} from "@/lib/music-beds";
import { assertFfmpegOk, runFfmpeg } from "@/lib/render/ffmpeg";
import {
  ensureSceneVoiceoversDir,
  sceneVoiceoverFileName,
  sceneVoiceoverRelativePath,
} from "@/lib/voiceover-scenes";

export class MusicBedAttachError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MusicBedAttachError";
  }
}

async function materializeBedClip({
  sourcePath,
  outputPath,
  targetDurationSec,
}: {
  sourcePath: string;
  outputPath: string;
  targetDurationSec: number;
}) {
  const sourceDuration = await getAudioDurationSec(sourcePath);
  const duration =
    Number.isFinite(targetDurationSec) && targetDurationSec > 0
      ? targetDurationSec
      : 2;

  if (
    sourceDuration != null &&
    sourceDuration > 0 &&
    sourceDuration <= duration + 0.15
  ) {
    await copyFile(sourcePath, outputPath);
    return;
  }

  const result = await runFfmpeg([
    "-y",
    "-i",
    sourcePath,
    "-t",
    duration.toFixed(3),
    "-ac",
    "1",
    "-ar",
    "44100",
    "-b:a",
    "128k",
    outputPath,
  ]);
  assertFfmpegOk(result, "Could not trim music bed for scene attach.");
}

async function materializeImportedBedClip({
  sourcePath,
  outputPath,
  targetDurationSec,
}: {
  sourcePath: string;
  outputPath: string;
  targetDurationSec: number;
}) {
  const duration =
    Number.isFinite(targetDurationSec) && targetDurationSec > 0
      ? targetDurationSec
      : MUSIC_BED_MIN_INTRO_SEC;

  // Always re-encode and trim to the visual-planner scene duration.
  // Stitch will loop/extend this clip under the next spoken scene for the fade.
  const result = await runFfmpeg([
    "-y",
    "-i",
    sourcePath,
    "-t",
    duration.toFixed(3),
    "-ac",
    "1",
    "-ar",
    "44100",
    "-b:a",
    "128k",
    outputPath,
  ]);
  assertFfmpegOk(
    result,
    "Could not convert/trim imported music bed to scene duration.",
  );
}

async function resolveMusicBedSource(preset: MusicBedPreset): Promise<{
  sourcePath: string;
  settingsBase: Omit<
    MusicBedAttachSettings,
    "targetDurationSec" | "attachedAt" | "cueKind"
  >;
}> {
  if (await musicBedLocalOverrideExists(preset)) {
    const localPath = musicBedLocalOverridePath(preset)!;
    return {
      sourcePath: localPath,
      settingsBase: {
        bedId: preset.id,
        title: preset.title,
        provider: MUSIC_BED_PROVIDER,
        licenseNote: preset.licenseNote,
        source: "local_override",
        sourceRelativePath: path.relative(process.cwd(), localPath),
      },
    };
  }

  try {
    const hit = await findFreesoundBedHit({
      query: preset.freesoundQuery,
      filter: preset.freesoundFilter,
    });
    const previewUrl = pickFreesoundPreviewUrl(hit);
    if (!previewUrl) {
      throw new MusicBedAttachError(
        `Freesound hit ${hit.id} has no MP3 preview.`,
      );
    }

    const cachePath = musicBedCachePath(preset.id, hit.id);
    await mkdir(path.dirname(cachePath), { recursive: true });

    try {
      // Reuse cached preview when present.
      await access(cachePath);
    } catch {
      const bytes = await downloadFreesoundPreview({ previewUrl });
      await writeFile(cachePath, bytes);
    }

    return {
      sourcePath: cachePath,
      settingsBase: {
        bedId: preset.id,
        title: hit.name || preset.title,
        provider: MUSIC_BED_PROVIDER,
        licenseNote: `${preset.licenseNote} License: ${hit.license}. Author: ${hit.username}.`,
        source: "freesound_preview",
        sourceRelativePath: path.relative(process.cwd(), cachePath),
        freesound: {
          id: hit.id,
          name: hit.name,
          username: hit.username,
          license: hit.license,
          url: hit.url ?? `https://freesound.org/s/${hit.id}/`,
          duration: hit.duration,
        },
      },
    };
  } catch (error) {
    if (error instanceof MusicBedAttachError) {
      throw error;
    }
    const message =
      error instanceof FreesoundError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Freesound music bed lookup failed.";
    throw new MusicBedAttachError(message);
  }
}

export async function attachMusicBedFileToScenePaths({
  videoId,
  sceneId,
  preset,
  visualIdea,
  visualPurpose,
  sceneDurationSec,
}: {
  videoId: string;
  sceneId: string;
  preset: MusicBedPreset;
  visualIdea?: string | null;
  visualPurpose?: string | null;
  sceneDurationSec?: number | null;
}) {
  await mkdir(musicBedLibraryDir(), { recursive: true });

  const resolved = await resolveMusicBedSource(preset);
  const directory = await ensureSceneVoiceoversDir(videoId);
  const fileName = sceneVoiceoverFileName({ sceneId });
  const absolutePath = path.join(directory, fileName);
  await mkdir(directory, { recursive: true });

  const targetDurationSec =
    typeof sceneDurationSec === "number" &&
    Number.isFinite(sceneDurationSec) &&
    sceneDurationSec > 0
      ? sceneDurationSec
      : preset.defaultDurationSec;

  await materializeBedClip({
    sourcePath: resolved.sourcePath,
    outputPath: absolutePath,
    targetDurationSec,
  });

  const durationSec = await getAudioDurationSec(absolutePath);
  const relativePath = sceneVoiceoverRelativePath(videoId, fileName);
  const settings: MusicBedAttachSettings = {
    ...resolved.settingsBase,
    cueKind: inferMusicBedCueKind({ visualIdea, visualPurpose }),
    targetDurationSec,
    attachedAt: new Date().toISOString(),
  };

  return {
    relativePath,
    fileName,
    durationSec,
    settings,
  };
}

const MUSIC_BED_IMPORT_MAX_BYTES = 20 * 1024 * 1024;
const MUSIC_BED_IMPORT_EXTENSIONS = new Set([
  ".mp3",
  ".wav",
  ".m4a",
  ".aac",
  ".ogg",
  ".flac",
  ".mp4",
]);

export function assertMusicBedImportFile(file: File) {
  if (!(file instanceof File) || file.size <= 0) {
    throw new MusicBedAttachError("Choose an audio file to import.");
  }
  if (file.size > MUSIC_BED_IMPORT_MAX_BYTES) {
    throw new MusicBedAttachError(
      "Imported music bed is too large (max 20 MB).",
    );
  }

  const lowerName = file.name.toLowerCase();
  const extension = path.extname(lowerName);
  const mime = (file.type || "").toLowerCase();
  const mimeOk =
    !mime ||
    mime.startsWith("audio/") ||
    mime === "video/mp4" ||
    mime === "application/octet-stream";
  if (!mimeOk || (extension && !MUSIC_BED_IMPORT_EXTENSIONS.has(extension))) {
    throw new MusicBedAttachError(
      "Unsupported audio type. Use mp3, wav, m4a, aac, ogg, or flac.",
    );
  }
}

export async function attachImportedMusicBedFileToScenePaths({
  videoId,
  sceneId,
  file,
  visualIdea,
  visualPurpose,
  sceneDurationSec,
}: {
  videoId: string;
  sceneId: string;
  file: File;
  visualIdea?: string | null;
  visualPurpose?: string | null;
  /** Visual-planner duration — imported audio is trimmed to this intro length. */
  sceneDurationSec?: number | null;
}) {
  assertMusicBedImportFile(file);

  const directory = await ensureSceneVoiceoversDir(videoId);
  await mkdir(directory, { recursive: true });
  await mkdir(musicBedLibraryDir(), { recursive: true });

  const extension = path.extname(file.name.toLowerCase()) || ".bin";
  const tempPath = path.join(
    directory,
    `.import_${sceneId}_${Date.now()}${extension}`,
  );
  const fileName = sceneVoiceoverFileName({ sceneId });
  const absolutePath = path.join(directory, fileName);

  const targetDurationSec =
    typeof sceneDurationSec === "number" &&
    Number.isFinite(sceneDurationSec) &&
    sceneDurationSec > 0
      ? sceneDurationSec
      : MUSIC_BED_MIN_INTRO_SEC;

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    await writeFile(tempPath, bytes);
    await materializeImportedBedClip({
      sourcePath: tempPath,
      outputPath: absolutePath,
      targetDurationSec,
    });
  } finally {
    await unlink(tempPath).catch(() => undefined);
  }

  const durationSec = await getAudioDurationSec(absolutePath);
  if (durationSec == null || durationSec <= 0) {
    throw new MusicBedAttachError(
      "Imported audio has no measurable duration.",
    );
  }

  const relativePath = sceneVoiceoverRelativePath(videoId, fileName);
  const cueKind = inferMusicBedCueKind({ visualIdea, visualPurpose });
  const settings: MusicBedAttachSettings = {
    bedId: `import_${cueKind}`,
    title: file.name.replace(/\.[^.]+$/, "") || "Imported music bed",
    provider: MUSIC_BED_PROVIDER,
    cueKind,
    licenseNote: "User-imported audio — confirm you have rights to use it.",
    targetDurationSec,
    attachedAt: new Date().toISOString(),
    source: "user_import",
    sourceRelativePath: relativePath,
    originalFileName: file.name,
  };

  return {
    relativePath,
    fileName,
    durationSec,
    settings,
    targetDurationSec,
  };
}
