import { execFile, spawn } from "node:child_process";
import os from "node:os";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * Chrome CDP used by Script / Visual Plan / Assets (Flow).
 * After Assets the pipeline no longer needs it until the next browser step.
 */

function cdpHttpBaseUrl() {
  return (
    process.env.GOOGLE_FLOW_CDP_URL?.trim() ||
    process.env.GOOGLE_FLOW_CHROME_CDP_URL?.trim() ||
    process.env.CHATGPT_CDP_URL?.trim() ||
    process.env.BROWSER_CDP_URL?.trim() ||
    "http://127.0.0.1:9222"
  );
}

export function pipelineChromeCdpPort() {
  try {
    const url = new URL(cdpHttpBaseUrl());
    if (url.port) {
      return Number(url.port);
    }
    return url.protocol === "https:" ? 443 : 80;
  } catch {
    return 9222;
  }
}

export function pipelineChromeCdpUrl() {
  return cdpHttpBaseUrl();
}

function pipelineChromeExecutablePath() {
  return (
    process.env.GOOGLE_FLOW_CHROME_PATH?.trim() ||
    process.env.PIPELINE_CHROME_PATH?.trim() ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  );
}

function pipelineChromeUserDataDir() {
  return (
    process.env.GOOGLE_FLOW_CHROME_USER_DATA_DIR?.trim() ||
    process.env.PIPELINE_CHROME_USER_DATA_DIR?.trim() ||
    `${os.homedir()}/.videomaker-flow-chrome`
  );
}

async function isChromeCdpHealthy(cdpUrl = cdpHttpBaseUrl()) {
  try {
    const response = await fetch(new URL("/json/version", cdpUrl), {
      cache: "no-store",
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForChromeCdp(cdpUrl: string, timeoutMs: number) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await isChromeCdpHealthy(cdpUrl)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

export async function ensurePipelineChromeCdpAvailable(options: {
  timeoutMs?: number;
} = {}): Promise<{
  launched: boolean;
  cdpUrl: string;
  port: number;
  executablePath: string;
  userDataDir: string;
  message: string;
}> {
  const cdpUrl = cdpHttpBaseUrl();
  const port = pipelineChromeCdpPort();
  const executablePath = pipelineChromeExecutablePath();
  const userDataDir = pipelineChromeUserDataDir();

  if (await isChromeCdpHealthy(cdpUrl)) {
    return {
      launched: false,
      cdpUrl,
      port,
      executablePath,
      userDataDir,
      message: `Chrome CDP already available at ${cdpUrl}.`,
    };
  }

  const child = spawn(
    executablePath,
    [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userDataDir}`,
      "--no-first-run",
      "--no-default-browser-check",
    ],
    {
      detached: true,
      stdio: "ignore",
    },
  );

  await new Promise<void>((resolve, reject) => {
    let timer: NodeJS.Timeout;
    const onError = (error: Error) => {
      clearTimeout(timer);
      reject(error);
    };
    timer = setTimeout(() => {
      child.off("error", onError);
      resolve();
    }, 250);
    child.once("error", onError);
  });
  child.unref();

  const ready = await waitForChromeCdp(cdpUrl, options.timeoutMs ?? 20000);
  if (!ready) {
    throw new Error(
      `Launched Chrome but CDP did not become available at ${cdpUrl}.`,
    );
  }

  return {
    launched: true,
    cdpUrl,
    port,
    executablePath,
    userDataDir,
    message: `Launched Chrome CDP at ${cdpUrl} with profile ${userDataDir}.`,
  };
}

async function listPidsOnPort(port: number): Promise<number[]> {
  try {
    const { stdout } = await execFileAsync("lsof", ["-ti", `tcp:${port}`], {
      encoding: "utf8",
      timeout: 5000,
    });
    return [
      ...new Set(
        stdout
          .split(/\s+/)
          .map((value) => Number(value.trim()))
          .filter((pid) => Number.isFinite(pid) && pid > 0),
      ),
    ];
  } catch {
    return [];
  }
}

async function processCommandLine(pid: number): Promise<string> {
  try {
    const { stdout } = await execFileAsync("ps", ["-p", String(pid), "-o", "command="], {
      encoding: "utf8",
      timeout: 5000,
    });
    return stdout.trim();
  } catch {
    return "";
  }
}

function isPipelineChromeProcess(commandLine: string) {
  if (!/Google Chrome|Chromium|chrome/i.test(commandLine)) {
    return false;
  }
  // Prefer the dedicated VideoMaker profile; also accept any Chrome owned by
  // our remote-debugging port (same process we use for Flow / ChatGPT).
  if (/videomaker-flow-chrome/i.test(commandLine)) {
    return true;
  }
  if (/--remote-debugging-port=\d+/i.test(commandLine)) {
    return true;
  }
  return false;
}

/**
 * Quit the CDP Chrome used by pipeline browser steps so voiceover / WhisperX /
 * render can reclaim RAM. Does not touch unrelated Chrome windows without
 * remote-debugging-port / videomaker profile.
 */
export async function quitPipelineChromeBrowser(): Promise<{
  quit: boolean;
  port: number;
  killedPids: number[];
  message: string;
}> {
  const port = pipelineChromeCdpPort();
  const pids = await listPidsOnPort(port);
  const killedPids: number[] = [];

  for (const pid of pids) {
    const command = await processCommandLine(pid);
    if (!isPipelineChromeProcess(command)) {
      continue;
    }
    try {
      process.kill(pid, "SIGTERM");
      killedPids.push(pid);
    } catch {
      try {
        process.kill(pid, "SIGKILL");
        killedPids.push(pid);
      } catch {
        // already gone
      }
    }
  }

  if (killedPids.length === 0) {
    return {
      quit: false,
      port,
      killedPids,
      message: `No pipeline Chrome on port ${port} to quit.`,
    };
  }

  // Give Chrome a moment to exit so ports/RAM free before Chatterbox starts.
  await new Promise((resolve) => setTimeout(resolve, 1500));

  return {
    quit: true,
    port,
    killedPids,
    message: `Quit pipeline Chrome on port ${port} (pid ${killedPids.join(", ")}). Re-launch before the next Script/Visual/Assets run.`,
  };
}
