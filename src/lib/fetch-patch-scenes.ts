export type PatchSceneRow = {
  id: string;
  sortOrder: number;
  scriptText: string;
  visualIdea: string | null;
  imagePrompt: string | null;
  hasGeneratedImage?: boolean;
};

export async function fetchPatchScenes(url: string): Promise<PatchSceneRow[]> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Could not load scenes (${response.status}).`);
  }
  const data = (await response.json()) as unknown;
  if (!Array.isArray(data)) {
    throw new Error("Scenes payload was not an array.");
  }
  return data as PatchSceneRow[];
}
