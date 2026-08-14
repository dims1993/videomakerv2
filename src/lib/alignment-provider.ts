/** Client-safe alignment provider types (no Node/fs/prisma). */

export type AlignmentProvider = "elevenlabs" | "whisperx";

export function parseAlignmentProvider(
  value: unknown,
  fallback: AlignmentProvider = "elevenlabs",
): AlignmentProvider {
  if (value === "whisperx" || value === "elevenlabs") {
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim().toLowerCase();
    if (trimmed === "whisperx") {
      return "whisperx";
    }
    if (trimmed === "elevenlabs") {
      return "elevenlabs";
    }
  }
  return fallback;
}
