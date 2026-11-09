import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { LoggerModule } from 'nestjs-pino';

export interface LoggingOptions {
  level: string;
  pretty: boolean;
  quietPaths?: string[];
}

export const REDACT_PATHS = [
  'req.headers.cookie',
  'req.headers.authorization',
  'req.headers["x-internal-token"]',
  'req.headers["idempotency-key"]',
  'res.headers["set-cookie"]',
  '*.password',
  '*.newPassword',
  '*.currentPassword',
  '*.secret',
  '*.token',
  '*.totpURI',
  '*.backupCodes',
];

const REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/;

export function requestIdFor(req: IncomingMessage): string {
  const incoming = req.headers['x-request-id'];
  const value = Array.isArray(incoming) ? incoming[0] : incoming;
  return value && REQUEST_ID.test(value) ? value : randomUUID();
}

export function createLoggerModule(options: LoggingOptions) {
  const quiet = new Set(options.quietPaths ?? []);
  return LoggerModule.forRoot({
    pinoHttp: {
      level: options.level,
      genReqId: (req) => requestIdFor(req),
      redact: { paths: REDACT_PATHS, censor: '[redacted]' },
      autoLogging: {
        ignore: (req) => quiet.has((req.url ?? '').split('?')[0]),
      },
      serializers: {
        req: (req: { id: string; method: string; url: string }) => ({
          id: req.id,
          method: req.method,
          url: req.url,
        }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
      transport: options.pretty
        ? {
            target: 'pino-pretty',
            options: { singleLine: true, translateTime: 'SYS:HH:MM:ss' },
          }
        : undefined,
    },
  });
}
