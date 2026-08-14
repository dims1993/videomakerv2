/**
 * Freesound APIv2 client (token auth).
 * Preview MP3s are available with API key only (no OAuth).
 * Docs: https://freesound.org/docs/api/
 */

function envValue(key: string) {
  return process.env[key]?.trim() || "";
}

export function getFreesoundApiKey() {
  return envValue("FREESOUND_API_KEY");
}

export class FreesoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FreesoundError";
  }
}

export type FreesoundPreviewUrls = {
  "preview-hq-mp3"?: string;
  "preview-lq-mp3"?: string;
  "preview-hq-ogg"?: string;
  "preview-lq-ogg"?: string;
};

export type FreesoundSearchHit = {
  id: number;
  name: string;
  tags: string[];
  username: string;
  license: string;
  duration: number;
  avg_rating?: number;
  num_ratings?: number;
  url?: string;
  previews?: FreesoundPreviewUrls;
};

type FreesoundSearchResponse = {
  count: number;
  results: FreesoundSearchHit[];
};

export async function searchFreesoundSounds({
  query,
  filter,
  pageSize = 8,
  sort = "rating_desc",
}: {
  query: string;
  filter?: string;
  pageSize?: number;
  sort?: string;
}): Promise<FreesoundSearchHit[]> {
  const apiKey = getFreesoundApiKey();
  if (!apiKey) {
    throw new FreesoundError(
      "Missing FREESOUND_API_KEY. Create one at https://freesound.org/apiv2/apply and add it to .env.",
    );
  }

  const url = new URL("https://freesound.org/apiv2/search/text/");
  url.searchParams.set("query", query);
  url.searchParams.set("page_size", String(Math.min(Math.max(pageSize, 1), 15)));
  url.searchParams.set("sort", sort);
  url.searchParams.set(
    "fields",
    "id,name,tags,username,license,duration,avg_rating,num_ratings,url,previews",
  );
  if (filter?.trim()) {
    url.searchParams.set("filter", filter.trim());
  }
  url.searchParams.set("token", apiKey);

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
  } catch {
    throw new FreesoundError("Could not reach Freesound API.");
  }

  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 240);
    throw new FreesoundError(
      `Freesound search failed (${response.status})${detail ? `: ${detail}` : "."}`,
    );
  }

  const payload = (await response.json()) as FreesoundSearchResponse;
  return Array.isArray(payload.results) ? payload.results : [];
}

export function pickFreesoundPreviewUrl(hit: FreesoundSearchHit): string | null {
  return (
    hit.previews?.["preview-hq-mp3"]?.trim() ||
    hit.previews?.["preview-lq-mp3"]?.trim() ||
    null
  );
}

export async function downloadFreesoundPreview({
  previewUrl,
}: {
  previewUrl: string;
}): Promise<Buffer> {
  const apiKey = getFreesoundApiKey();
  let response: Response;
  try {
    response = await fetch(previewUrl, {
      headers: apiKey
        ? { Authorization: `Token ${apiKey}` }
        : undefined,
      cache: "no-store",
    });
  } catch {
    throw new FreesoundError("Could not download Freesound preview.");
  }

  if (!response.ok) {
    throw new FreesoundError(
      `Freesound preview download failed (${response.status}).`,
    );
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength < 1_000) {
    throw new FreesoundError("Freesound preview download was empty or too small.");
  }
  return bytes;
}

export async function findFreesoundBedHit({
  query,
  filter,
}: {
  query: string;
  filter?: string;
}): Promise<FreesoundSearchHit> {
  const results = await searchFreesoundSounds({ query, filter, pageSize: 10 });
  const withPreview = results.find((hit) => pickFreesoundPreviewUrl(hit));
  if (!withPreview) {
    throw new FreesoundError(
      `No Freesound preview found for query "${query}". Try another preset or refine the search.`,
    );
  }
  return withPreview;
}
