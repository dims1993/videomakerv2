/**
 * One-shot: copy curated Day-1 scenes into the podcast image library.
 *
 * Usage:
 *   npx tsx scripts/import-podcast-image-library.ts
 *   npx tsx scripts/import-podcast-image-library.ts --videoId=cms… --maxOrder=150
 */

import {
  importPodcastImageLibraryFromVideo,
} from "@/lib/podcast-image-library";

function argValue(name: string) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

async function main() {
  const videoId =
    argValue("videoId") ?? "cms7alvzy0000nu84mv44maz6";
  const maxOrder = Number(argValue("maxOrder") ?? "150");

  const result = await importPodcastImageLibraryFromVideo({
    videoId,
    maxOrder: Number.isFinite(maxOrder) ? maxOrder : 150,
    includeExtraMusicBeds: true,
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
