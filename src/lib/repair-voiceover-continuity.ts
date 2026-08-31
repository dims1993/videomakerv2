/**
 * Helpers for scripts/repair-voiceover-continuity.ts
 * Keeps FormData building + VO generation callable without Next redirects.
 */

import { buildVoiceoverFormData } from "@/lib/pipeline-steps";

export async function buildVoiceoverFormDataForRepair(videoId: string) {
  return buildVoiceoverFormData(videoId);
}

export async function generateVoiceoverForScenesForRepair(
  videoId: string,
  formData: FormData,
  options: {
    selectedOrders?: number[];
    missingOnly?: boolean;
    retryFailedOnly?: boolean;
    overwrite?: boolean;
    processId?: string;
  } = {},
) {
  const { generateVoiceoverForScenesForRepair: run } = await import(
    "@/app/actions"
  );
  return run(videoId, formData, options);
}
