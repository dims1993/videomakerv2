const WORKER_CANCEL_KEY = "__videomaker_pipeline_worker_cancel__";
const WORKER_RUNNING_KEY = "__videomaker_pipeline_worker_running__";
const WORKER_PROCESS_ID_KEY = "__videomaker_pipeline_worker_process_id__";

type PipelineWorkerGlobal = typeof globalThis & {
  [WORKER_CANCEL_KEY]?: boolean;
  [WORKER_RUNNING_KEY]?: boolean;
  [WORKER_PROCESS_ID_KEY]?: string | null;
};

function store() {
  return globalThis as PipelineWorkerGlobal;
}

export function isPipelineWorkerRunning() {
  return Boolean(store()[WORKER_RUNNING_KEY]);
}

export function setPipelineWorkerRunning(running: boolean) {
  store()[WORKER_RUNNING_KEY] = running;
}

export function getPipelineWorkerProcessId() {
  return store()[WORKER_PROCESS_ID_KEY] ?? null;
}

export function setPipelineWorkerProcessId(processId: string | null) {
  store()[WORKER_PROCESS_ID_KEY] = processId;
}

export function requestPipelineWorkerCancel() {
  store()[WORKER_CANCEL_KEY] = true;
}

export function clearPipelineWorkerCancel() {
  store()[WORKER_CANCEL_KEY] = false;
}

export function isPipelineWorkerCancelRequested() {
  return Boolean(store()[WORKER_CANCEL_KEY]);
}
