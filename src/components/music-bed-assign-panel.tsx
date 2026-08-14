import {
  attachMusicBedsToScenes,
  attachSceneClipVideo,
  attachSuggestedMusicBeds,
  clearSceneClipVideo,
  importMusicBedAudioToScene,
  updateSceneClipMuted,
} from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { MusicBedPreset } from "@/lib/music-beds";
import {
  isMusicBedScene,
  suggestMusicBedPresetId,
} from "@/lib/music-beds";

type MusicBedSceneRow = {
  id: string;
  sortOrder: number;
  scriptText: string;
  visualIdea: string | null;
  visualPurpose: string | null;
  duration: number | null;
  voiceoverLocalPath: string | null;
  voiceoverStatus: string | null;
  voiceoverProvider: string | null;
  clipLocalPath: string | null;
  clipFileName: string | null;
  clipMuted: boolean;
};

export function MusicBedAssignPanel({
  videoId,
  formId,
  scenes,
  presets,
  hasFreesoundKey,
}: {
  videoId: string;
  formId: string;
  scenes: MusicBedSceneRow[];
  presets: MusicBedPreset[];
  hasFreesoundKey: boolean;
}) {
  const musicBedScenes = scenes.filter((scene) => isMusicBedScene(scene));

  if (musicBedScenes.length === 0) {
    return null;
  }

  const missingCount = musicBedScenes.filter(
    (scene) => !scene.voiceoverLocalPath?.trim(),
  ).length;

  return (
    <div className="space-y-3 rounded-md border border-sky-200/80 bg-sky-50/40 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium">Freesound music beds</p>
          <p className="text-xs text-muted-foreground">
            {musicBedScenes.length} MUSIC_BED scene
            {musicBedScenes.length === 1 ? "" : "s"} detected
            {missingCount > 0 ? ` · ${missingCount} still need a track` : " · all attached"}
            . Searches Freesound by cue (begin / fade / outro), takes the
            top-rated result with an MP3 preview, trims to scene duration — or
            import your own audio below. Optional: attach a muted video clip as
            the visual (fitted to scene duration). Muted → music bed audio only.
            Keep clip audio → clip audio only (no music bed under that scene).
            {!hasFreesoundKey ? (
              <>
                {" "}
                Add <code className="text-[11px]">FREESOUND_API_KEY</code> to{" "}
                <code className="text-[11px]">.env</code> (
                <a
                  href="https://freesound.org/apiv2/apply"
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  get a key
                </a>
                ).
              </>
            ) : null}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Freesound pick is deterministic for a given preset query (sorted by
            rating, first hit with preview) — not random. Optional local overrides:{" "}
            <code>data/music-beds/freesound/*.mp3</code>
          </p>
        </div>
        <Button
          type="submit"
          variant="outline"
          size="sm"
          form={formId}
          formAction={attachSuggestedMusicBeds.bind(null, videoId)}
        >
          Attach suggested beds
        </Button>
      </div>

      <div className="max-h-[28rem] space-y-3 overflow-auto">
        {musicBedScenes.map((scene) => {
          const suggestedId = suggestMusicBedPresetId({
            visualIdea: scene.visualIdea,
            visualPurpose: scene.visualPurpose,
          });
          const attached = Boolean(scene.voiceoverLocalPath?.trim());
          const hasClip = Boolean(scene.clipLocalPath?.trim());
          const importFormId = `music-bed-import-${videoId}-${scene.sortOrder}`;
          const clipFormId = `music-bed-clip-${videoId}-${scene.sortOrder}`;
          const muteFormId = `music-bed-clip-mute-${videoId}-${scene.sortOrder}`;

          return (
            <div
              key={scene.id}
              className="space-y-3 rounded-md border bg-background/80 p-3"
            >
              <div className="grid gap-2 sm:grid-cols-[auto_1fr_auto] sm:items-end">
                <div className="text-sm font-medium">Scene {scene.sortOrder}</div>
                <div className="min-w-0 space-y-1">
                  <p className="truncate text-xs text-muted-foreground">
                    {scene.visualIdea || "MUSIC_BED"}
                    {scene.duration ? ` · ${scene.duration}s visual` : ""}
                    {attached ? " · audio attached" : " · missing audio"}
                    {hasClip
                      ? ` · video clip${scene.clipMuted ? " (muted)" : " (audio on)"}`
                      : ""}
                  </p>
                  <div className="grid gap-1">
                    <Label
                      htmlFor={`musicBedPreset-${scene.sortOrder}`}
                      className="text-xs"
                    >
                      Track preset
                    </Label>
                    <select
                      id={`musicBedPreset-${scene.sortOrder}`}
                      name={`musicBedPresetByOrder[${scene.sortOrder}]`}
                      form={formId}
                      defaultValue={suggestedId}
                      className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                    >
                      {presets.map((preset) => (
                        <option key={preset.id} value={preset.id}>
                          {preset.title}
                          {preset.id === suggestedId ? " (suggested)" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="submit"
                    size="sm"
                    variant="secondary"
                    form={formId}
                    formAction={attachMusicBedsToScenes.bind(
                      null,
                      videoId,
                      scene.sortOrder,
                    )}
                  >
                    {attached ? "Re-attach Freesound" : "Attach from Freesound"}
                  </Button>
                </div>
              </div>

              <form
                id={importFormId}
                action={importMusicBedAudioToScene.bind(
                  null,
                  videoId,
                  scene.sortOrder,
                )}
                encType="multipart/form-data"
                className="grid gap-2 border-t border-dashed pt-3 sm:grid-cols-[1fr_auto] sm:items-end"
              >
                <div className="grid gap-1">
                  <Label
                    htmlFor={`musicBedAudio-${scene.sortOrder}`}
                    className="text-xs"
                  >
                    Or import your own audio
                    {scene.duration && scene.duration <= 12
                      ? ` (trimmed to ${scene.duration}s + underlay fade on stitch)`
                      : " (trimmed to planner/preset intro + underlay fade on stitch)"}
                  </Label>
                  <input
                    id={`musicBedAudio-${scene.sortOrder}`}
                    name="musicBedAudio"
                    type="file"
                    accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac"
                    required
                    className="block w-full text-xs file:mr-2 file:rounded-md file:border-0 file:bg-muted file:px-2 file:py-1.5 file:text-xs"
                  />
                </div>
                <Button type="submit" size="sm" variant="outline">
                  Import audio
                </Button>
              </form>

              <form
                id={clipFormId}
                action={attachSceneClipVideo.bind(
                  null,
                  videoId,
                  scene.sortOrder,
                )}
                encType="multipart/form-data"
                className="grid gap-2 border-t border-dashed pt-3"
              >
                <div className="grid gap-1">
                  <Label
                    htmlFor={`sceneClipVideo-${scene.sortOrder}`}
                    className="text-xs"
                  >
                    Optional intro video (replaces still image; fitted to scene
                    duration)
                  </Label>
                  <input
                    id={`sceneClipVideo-${scene.sortOrder}`}
                    name="sceneClipVideo"
                    type="file"
                    accept="video/*,.mp4,.mov,.webm,.mkv,.m4v"
                    required
                    className="block w-full text-xs file:mr-2 file:rounded-md file:border-0 file:bg-muted file:px-2 file:py-1.5 file:text-xs"
                  />
                </div>
                <input type="hidden" name="clipMuted" value="0" />
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    name="clipMuted"
                    value="1"
                    defaultChecked={scene.clipMuted !== false}
                  />
                  Mute clip audio (use music bed instead)
                </label>
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" size="sm" variant="outline">
                    {hasClip ? "Replace video clip" : "Attach video clip"}
                  </Button>
                  {hasClip ? (
                    <Button
                      type="submit"
                      size="sm"
                      variant="ghost"
                      formAction={clearSceneClipVideo.bind(
                        null,
                        videoId,
                        scene.sortOrder,
                      )}
                    >
                      Clear video clip
                    </Button>
                  ) : null}
                </div>
                {hasClip ? (
                  <p className="text-[11px] text-muted-foreground">
                    Current: {scene.clipFileName || scene.clipLocalPath}
                  </p>
                ) : null}
              </form>

              {hasClip ? (
                <form
                  id={muteFormId}
                  action={updateSceneClipMuted.bind(
                    null,
                    videoId,
                    scene.sortOrder,
                  )}
                  className="flex flex-wrap items-center gap-2 border-t border-dashed pt-3"
                >
                  <label className="flex items-center gap-2 text-xs">
                    <input type="radio" name="clipMuted" value="1" defaultChecked={scene.clipMuted !== false} />
                    Muted (music bed only)
                  </label>
                  <label className="flex items-center gap-2 text-xs">
                    <input type="radio" name="clipMuted" value="0" defaultChecked={scene.clipMuted === false} />
                    Keep clip audio only (no music bed)
                  </label>
                  <Button type="submit" size="sm" variant="secondary">
                    Save mute
                  </Button>
                </form>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
