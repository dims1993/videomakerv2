import type { TimelineAlignmentReport } from "@/lib/timeline-alignment";

export function TimelineAlignmentBanner({
  report,
}: {
  report: TimelineAlignmentReport;
}) {
  if (report.status === "unknown") {
    return (
      <div className="rounded-md border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Timeline alignment</p>
        <p className="mt-1">{report.message}</p>
      </div>
    );
  }

  if (report.status === "aligned") {
    return (
      <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-200">
        <p className="font-medium">Timeline aligned</p>
        <p className="mt-1">
          {report.message}
          {report.masterSec != null && report.subtitleTimelineSec != null ? (
            <span className="mt-1 block text-xs opacity-90">
              Master {report.masterSec.toFixed(2)}s · Subtitle/image clock{" "}
              {report.subtitleTimelineSec.toFixed(2)}s
            </span>
          ) : null}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
      <p className="font-medium">Timeline misaligned</p>
      <p className="mt-1">{report.message}</p>
      {report.masterSec != null && report.subtitleTimelineSec != null ? (
        <p className="mt-2 text-xs opacity-90">
          Master {report.masterSec.toFixed(2)}s · Subtitle/image clock{" "}
          {report.subtitleTimelineSec.toFixed(2)}s · Δ{" "}
          {(report.deltaSec ?? 0) > 0 ? "+" : ""}
          {(report.deltaSec ?? 0).toFixed(2)}s
        </p>
      ) : null}
    </div>
  );
}
