"use server";

import { checkWhisperXHealth } from "@/lib/whisperx";
import {
  getWhisperXProcessStatus,
  startWhisperXServer,
  stopWhisperXServer,
} from "@/lib/whisperx-process";

export async function checkWhisperXHealthAction() {
  return checkWhisperXHealth();
}

export async function getWhisperXProcessStatusAction() {
  return getWhisperXProcessStatus();
}

export async function startWhisperXServerAction() {
  return startWhisperXServer();
}

export async function stopWhisperXServerAction() {
  return stopWhisperXServer();
}
