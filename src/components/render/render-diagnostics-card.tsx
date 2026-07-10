import type { getRenderDiagnostics } from "@/app/actions";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type RenderDiagnostics = Awaited<ReturnType<typeof getRenderDiagnostics>>;

function DiagnosticItem({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border bg-muted/20 px-3 py-2">
      <p className="text-xs font-medium uppercase text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 break-words text-sm font-semibold">{value}</p>
    </div>
  );
}

function yesNo(value: boolean) {
  return value ? "Yes" : "No";
}

function available(value: boolean) {
  return value ? "Available" : "Missing";
}

function prettyJson(value: unknown) {
  if (!value) {
    return "Not available";
  }

  return JSON.stringify(value, null, 2);
}

export function RenderDiagnosticsCard({
  diagnostics,
  burnCaptionsEnabled,
  assCaptionSourceAvailable,
}: {
  diagnostics: RenderDiagnostics;
  burnCaptionsEnabled: boolean;
  assCaptionSourceAvailable: boolean;
}) {
  const ffmpegMessage = !diagnostics.ffmpeg.available
    ? "FFmpeg is required to render drafts."
    : diagnostics.ffmpeg.hasAssFilter
      ? "FFmpeg is ready for active-word ASS captions."
      : "Selected FFmpeg cannot burn ASS captions. Install ffmpeg-full or disable Burn captions.";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Render Diagnostics</CardTitle>
        <CardDescription>{ffmpegMessage}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {diagnostics.files.finalVideo.available &&
        !diagnostics.files.finalVideo.hasAudioStream ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
            Final video has no audio. This render is invalid.
          </div>
        ) : null}
        {diagnostics.files.finalVideo.hasAudioStream ? (
          <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-900">
            Final MP4 contains audio.
          </div>
        ) : null}

        <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <DiagnosticItem label="FFmpeg binary" value={diagnostics.ffmpeg.binary} />
          <DiagnosticItem
            label="FFmpeg installed"
            value={yesNo(diagnostics.ffmpeg.available)}
          />
          <DiagnosticItem
            label="ASS captions"
            value={diagnostics.ffmpeg.hasAssFilter ? "Supported" : "Not supported"}
          />
          <DiagnosticItem
            label="FFprobe binary"
            value={diagnostics.ffprobe.binary}
          />
          <DiagnosticItem
            label="FFprobe available"
            value={yesNo(diagnostics.ffprobe.available)}
          />
          <DiagnosticItem
            label="Burn captions"
            value={burnCaptionsEnabled ? "Enabled" : "Disabled"}
          />
          <DiagnosticItem
            label="ASS file"
            value={available(
              assCaptionSourceAvailable || diagnostics.files.assFile.available,
            )}
          />
          <DiagnosticItem
            label="Combined audio"
            value={available(diagnostics.files.combinedAudio.available)}
          />
          <DiagnosticItem
            label="Audio stream"
            value={yesNo(diagnostics.files.combinedAudio.hasAudioStream)}
          />
          <DiagnosticItem
            label="Draft file"
            value={available(diagnostics.files.finalVideo.available)}
          />
          <DiagnosticItem
            label="Video stream"
            value={yesNo(diagnostics.files.finalVideo.hasVideoStream)}
          />
          <DiagnosticItem
            label="Final audio stream"
            value={yesNo(diagnostics.files.finalVideo.hasAudioStream)}
          />
          <DiagnosticItem
            label="Final duration"
            value={
              diagnostics.files.finalVideo.probe?.durationSec
                ? `${diagnostics.files.finalVideo.probe.durationSec.toFixed(1)}s`
                : "Not detected"
            }
          />
        </div>

        <details className="rounded-md border bg-muted/20 p-3 text-sm">
          <summary className="cursor-pointer font-medium">
            Show advanced diagnostics
          </summary>
          <div className="mt-3 space-y-3">
            <DiagnosticItem
              label="FFmpeg version"
              value={diagnostics.ffmpeg.versionFirstLine ?? "Not available"}
            />
            <DiagnosticItem
              label="--enable-libass"
              value={String(diagnostics.ffmpeg.hasEnableLibass)}
            />
            <DiagnosticItem
              label="ASS filter check"
              value={diagnostics.ffmpeg.assFilterLine ?? "Not available"}
            />
            <DiagnosticItem
              label="render_manifest.json"
              value={diagnostics.manifestPath}
            />
            <DiagnosticItem
              label="render.log"
              value={diagnostics.logPath ?? "Not available"}
            />
            <pre className="max-h-48 overflow-auto rounded-md bg-background p-3 text-xs">
              {diagnostics.ffmpeg.configuration ?? "Configuration not available"}
            </pre>
            <pre className="max-h-64 overflow-auto rounded-md bg-background p-3 text-xs">
              {prettyJson(diagnostics.advanced.commands)}
            </pre>
            <pre className="max-h-64 overflow-auto rounded-md bg-background p-3 text-xs">
              {prettyJson(diagnostics.advanced.probes)}
            </pre>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
