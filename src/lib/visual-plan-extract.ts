import {
  parseAndValidateHandoffResponse,
  scenesToImportJson,
} from "@/lib/chatgpt-scene-handoff";

/**
 * Normalize a Visual Planner ChatGPT response into importable scenes JSON.
 */
export function extractVisualPlanScenesJson(rawResponse: string): string {
  const text = rawResponse.trim();
  if (!text) {
    throw new Error("ChatGPT returned an empty visual plan response.");
  }

  const validation = parseAndValidateHandoffResponse(text, {
    requireVisualIdeaPrefixes: true,
  });
  if (validation.errors.length > 0) {
    throw new Error(
      `Visual plan response failed validation: ${validation.errors.slice(0, 3).join(" ")}`,
    );
  }

  if (validation.scenes.length === 0) {
    throw new Error("ChatGPT returned no scenes in the visual plan response.");
  }

  return scenesToImportJson(validation.scenes);
}
