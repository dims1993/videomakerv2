import { spawn } from "node:child_process";
import { closeSync, existsSync, openSync } from "node:fs";
import { access, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  checkWhisperXHealth,
  getWhisperXBaseUrl,
} from "@/lib/whisperx";

const SERVER_DIR_NAME = "WhisperX-Server";
const PID_RELATIVE = path.join("storage", "whisperx-server.pid");
const LOG_RELATIVE = path.join("storage", "logs", "whisperx-server.log");

function serverDir() {
  const fromEnv = process.env.WHISPERX_SERVER_DIR?.trim();
  if (fromEnv) {
    return path.isAbsolute(fromEnv)
      ? fromEnv
      : path.join(process.cwd(), fromEnv);
  }
  return path.join(process.cwd(), SERVER_DIR_NAME);
}

function pythonBin() {
  return path.join(serverDir(), "venv", "bin", "python");
}

function pidPath() {
  return path.join(process.cwd(), PID_RELATIVE);
}

function logPath() {
  return path.join(process.cwd(), LOG_RELATIVE);
}

function portFromBaseUrl() {
  try {
    const url = new URL(getWhisperXBaseUrl());
    if (url.port) {
      return Number(url.port);
    }
    return url.protocol === "https:" ? 443 : 80;
  } catch {
    return 8011;
  }
}

export type WhisperXProcessStatus = {
  healthy: boolean;
  baseUrl: string;
  managedPid: number | null;
  processAlive: boolean;
  installReady: boolean;
  message: string;
};

async function readManagedPid(): Promise<number | null> {
  try {
    const raw = (await readFile(pidPath(), "utf8")).trim();
    const pid = Number(raw);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function isPidAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function clearPidFile() {
  try {
    await unlink(pidPath());
  } catch {
    // ignore
  }
}

async function writePidFile(pid: number) {
  await mkdir(path.dirname(pidPath()), { recursive: true });
  await writeFile(pidPath(), `${pid}\n`, "utf8");
}

export function getWhisperXInstallReady() {
  return (
    existsSync(pythonBin()) && existsSync(path.join(serverDir(), "server.py"))
  );
}

export async function getWhisperXProcessStatus(): Promise<WhisperXProcessStatus> {
  const baseUrl = getWhisperXBaseUrl();
  const installReady = getWhisperXInstallReady();
  const managedPid = await readManagedPid();
  const processAlive = managedPid != null ? isPidAlive(managedPid) : false;

  if (managedPid != null && !processAlive) {
    await clearPidFile();
  }

  const health = await checkWhisperXHealth();
  if (health.ok) {
    return {
      healthy: true,
      baseUrl,
      managedPid: processAlive ? managedPid : null,
      processAlive,
      installReady,
      message: processAlive
        ? `Online (managed pid ${managedPid}).`
        : "Online (started outside VideoMaker).",
    };
  }

  if (!installReady) {
    return {
      healthy: false,
      baseUrl,
      managedPid: null,
      processAlive: false,
      installReady: false,
      message: `WhisperX install not found at ${SERVER_DIR_NAME}/ (need venv + server.py). See WhisperX-Server/README.md.`,
    };
  }

  if (processAlive) {
    return {
      healthy: false,
      baseUrl,
      managedPid,
      processAlive: true,
      installReady,
      message: `Starting… process ${managedPid} is up but not ready yet (model load can take a minute). See ${LOG_RELATIVE}.`,
    };
  }

  return {
    healthy: false,
    baseUrl,
    managedPid: null,
    processAlive: false,
    installReady,
    message: health.message,
  };
}

function killProcessTree(pid: number) {
  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // ignore
    }
  }
}

async function killPortListeners(port: number) {
  if (!Number.isFinite(port) || port <= 0) {
    return;
  }
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execFileAsync = promisify(execFile);
  try {
    const { stdout } = await execFileAsync("lsof", ["-ti", `tcp:${port}`], {
      timeout: 5_000,
    });
    const pids = stdout
      .split(/\s+/)
      .map((value) => Number(value.trim()))
      .filter((pid) => Number.isInteger(pid) && pid > 0);
    for (const pid of pids) {
      try {
        process.kill(pid, "SIGTERM");
      } catch {
        // ignore
      }
    }
  } catch {
    // no listeners or lsof unavailable
  }
}

/**
 * Spawn WhisperX and return immediately. Callers should poll
 * {@link getWhisperXProcessStatus} until `healthy` (align model load is slow).
 */
export async function startWhisperXServer(): Promise<WhisperXProcessStatus> {
  const current = await getWhisperXProcessStatus();
  if (current.healthy) {
    return current;
  }
  if (!current.installReady) {
    throw new Error(current.message);
  }
  if (current.processAlive && current.managedPid) {
    return current;
  }

  await access(pythonBin());
  await mkdir(path.dirname(logPath()), { recursive: true });

  const logFd = openSync(logPath(), "a");
  let childPid: number | null = null;
  try {
    const child = spawn(pythonBin(), ["server.py"], {
      cwd: serverDir(),
      detached: true,
      stdio: ["ignore", logFd, logFd],
      env: {
        ...process.env,
        WHISPERX_BASE_URL: getWhisperXBaseUrl(),
        PORT: String(portFromBaseUrl()),
        HOST: "127.0.0.1",
        WHISPERX_DEVICE: process.env.WHISPERX_DEVICE?.trim() || "cpu",
        PYTORCH_ENABLE_MPS_FALLBACK: "1",
      },
    });
    childPid = child.pid ?? null;
    child.unref();
  } finally {
    try {
      closeSync(logFd);
    } catch {
      // ignore
    }
  }

  if (!childPid) {
    throw new Error("Failed to spawn WhisperX server process.");
  }

  await writePidFile(childPid);
  await new Promise((resolve) => setTimeout(resolve, 500));
  return getWhisperXProcessStatus();
}

export async function stopWhisperXServer(): Promise<WhisperXProcessStatus> {
  const managedPid = await readManagedPid();
  if (managedPid != null && isPidAlive(managedPid)) {
    killProcessTree(managedPid);
  } else {
    await killPortListeners(portFromBaseUrl());
  }

  await new Promise((resolve) => setTimeout(resolve, 800));

  const stillManaged = managedPid != null && isPidAlive(managedPid);
  if (stillManaged) {
    try {
      process.kill(managedPid, "SIGKILL");
    } catch {
      // ignore
    }
  }

  await clearPidFile();

  const health = await checkWhisperXHealth();
  if (health.ok) {
    await killPortListeners(portFromBaseUrl());
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return getWhisperXProcessStatus();
}
