export interface WorkerOptions {
  pollIntervalMs?: number;
  batchSize?: number;
  leaseSeconds?: number;
  handlerTimeoutSeconds?: number;
  maxAttempts?: number;
  heartbeatFile?: string;
}

export type WorkerSettings = Required<Omit<WorkerOptions, 'heartbeatFile'>> &
  Pick<WorkerOptions, 'heartbeatFile'>;

export const WORKER_OPTIONS = Symbol.for('dax.platform-core.worker-options');

export function workerSettings(options: WorkerOptions = {}): WorkerSettings {
  const settings: WorkerSettings = {
    pollIntervalMs: options.pollIntervalMs ?? 2000,
    batchSize: options.batchSize ?? 20,
    leaseSeconds: options.leaseSeconds ?? 300,
    handlerTimeoutSeconds: options.handlerTimeoutSeconds ?? 30,
    maxAttempts: options.maxAttempts ?? 10,
    heartbeatFile: options.heartbeatFile,
  };
  if (settings.leaseSeconds <= settings.handlerTimeoutSeconds) {
    throw new Error('Worker leaseSeconds must exceed handlerTimeoutSeconds');
  }
  return settings;
}
