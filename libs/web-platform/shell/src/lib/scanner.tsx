'use client';

import {
  Alert,
  Box,
  Button,
  Group,
  Loader,
  Stack,
  TextInput,
} from '@mantine/core';
import {
  type FormEvent,
  type RefObject,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { BarcodeFormat } from 'barcode-detector/ponyfill';

export type ScannerStatus =
  | 'idle'
  | 'starting'
  | 'scanning'
  | 'denied'
  | 'no-camera'
  | 'insecure'
  | 'unsupported'
  | 'error';

interface Detector {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}
type CreateDetector = () => Detector;

interface NativeDetectorClass {
  new (options?: { formats?: string[] }): Detector;
  getSupportedFormats?: () => Promise<string[]>;
}

interface TorchCapabilities extends MediaTrackCapabilities {
  torch?: boolean;
}
interface TorchConstraintSet extends MediaTrackConstraintSet {
  torch?: boolean;
}

const WANTED_FORMATS: BarcodeFormat[] = [
  'qr_code',
  'code_128',
  'code_39',
  'code_93',
  'ean_13',
  'ean_8',
  'upc_a',
  'upc_e',
  'itf',
  'data_matrix',
];

const REPEAT_MS = 2500;
const FRAME_MS = 200;

let ponyfill: Promise<CreateDetector> | null = null;

function loadPonyfill(wasmBase: string): Promise<CreateDetector> {
  ponyfill ??= import('barcode-detector/ponyfill').then(async (m) => {
    await m.prepareZXingModule({
      overrides: {
        locateFile: (path: string, prefix: string) =>
          path.endsWith('.wasm')
            ? `${wasmBase}/${m.ZXING_WASM_VERSION}/${path}`
            : prefix + path,
      },
      fireImmediately: true,
    });
    return () => new m.BarcodeDetector({ formats: WANTED_FORMATS });
  });
  ponyfill.catch(() => {
    ponyfill = null;
  });
  return ponyfill;
}

async function loadDetector(wasmBase: string): Promise<CreateDetector> {
  const native = (globalThis as { BarcodeDetector?: NativeDetectorClass })
    .BarcodeDetector;
  if (native?.getSupportedFormats) {
    const supported: string[] = await native
      .getSupportedFormats()
      .catch(() => []);
    if (supported.includes('qr_code')) {
      const formats = WANTED_FORMATS.filter((f) => supported.includes(f));
      return () => new native({ formats });
    }
  }
  return loadPonyfill(wasmBase);
}

function statusFromError(error: unknown): ScannerStatus {
  const name = error instanceof Error ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied';
  if (name === 'NotFoundError' || name === 'OverconstrainedError')
    return 'no-camera';
  return 'error';
}

function stopStream(stream: MediaStream) {
  for (const track of stream.getTracks()) track.stop();
}

function torchSupported(track: MediaStreamTrack | undefined): boolean {
  if (!track || typeof track.getCapabilities !== 'function') return false;
  const caps: TorchCapabilities = track.getCapabilities();
  return caps.torch === true;
}

function subscribeVisibility(onChange: () => void) {
  document.addEventListener('visibilitychange', onChange);
  return () => document.removeEventListener('visibilitychange', onChange);
}

function usePageVisible(): boolean {
  return useSyncExternalStore(
    subscribeVisibility,
    () => document.visibilityState === 'visible',
    () => true,
  );
}

export interface UseScannerOptions {
  enabled: boolean;
  onDetect: (code: string) => void;
  /** Same-origin folder holding `<version>/zxing_reader.wasm`. */
  wasmBase?: string;
}

export interface UseScanner {
  videoRef: RefObject<HTMLVideoElement | null>;
  status: ScannerStatus;
  torch: { supported: boolean; on: boolean };
  toggleTorch: () => Promise<void>;
  restart: () => void;
}

export function useScanner({
  enabled,
  onDetect,
  wasmBase = '/zxing',
}: UseScannerOptions): UseScanner {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const onDetectRef = useRef(onDetect);
  const lastRef = useRef({ code: '', at: 0 });
  const [status, setStatus] = useState<ScannerStatus>('idle');
  const [torch, setTorch] = useState({ supported: false, on: false });
  const [attempt, setAttempt] = useState(0);
  const visible = usePageVisible();
  const running = enabled && visible;

  useEffect(() => {
    onDetectRef.current = onDetect;
  });

  useEffect(() => {
    if (!running) return;
    let cancelled = false;
    let timer: number | undefined;
    let stream: MediaStream | null = null;

    function report(raw: string) {
      const code = raw.trim();
      const now = Date.now();
      const last = lastRef.current;
      if (!code || (code === last.code && now - last.at < REPEAT_MS)) return;
      lastRef.current = { code, at: now };
      if ('vibrate' in navigator) navigator.vibrate(60);
      onDetectRef.current(code);
    }

    async function start() {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setStatus('insecure');
        return;
      }
      setStatus('starting');
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });
      } catch (error) {
        if (!cancelled) setStatus(statusFromError(error));
        return;
      }
      if (cancelled) return stopStream(stream);
      streamRef.current = stream;

      let createDetector: CreateDetector;
      try {
        createDetector = await loadDetector(wasmBase);
      } catch {
        if (!cancelled) setStatus('unsupported');
        return;
      }
      const video = videoRef.current;
      if (cancelled || !video) return;
      video.srcObject = stream;
      try {
        await video.play();
      } catch {
        if (!cancelled) setStatus('error');
        return;
      }
      if (cancelled) return;
      setTorch({
        supported: torchSupported(stream.getVideoTracks()[0]),
        on: false,
      });
      setStatus('scanning');

      const detector = createDetector();
      const tick = async () => {
        if (cancelled) return;
        if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          try {
            const found = await detector.detect(video);
            if (found[0]) report(found[0].rawValue);
          } catch {
            // A frame can fail to decode while the camera adjusts.
          }
        }
        if (!cancelled) timer = window.setTimeout(tick, FRAME_MS);
      };
      void tick();
    }

    void start();
    const video = videoRef.current;
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (stream) stopStream(stream);
      streamRef.current = null;
      if (video) video.srcObject = null;
      setStatus('idle');
      setTorch({ supported: false, on: false });
    };
  }, [running, wasmBase, attempt]);

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const on = !torch.on;
    const advanced: TorchConstraintSet[] = [{ torch: on }];
    try {
      await track.applyConstraints({ advanced });
      setTorch({ supported: true, on });
    } catch {
      setTorch({ supported: false, on: false });
    }
  }

  return {
    videoRef,
    status,
    torch,
    toggleTorch,
    restart: () => setAttempt((n) => n + 1),
  };
}

const STATUS_MESSAGES: Partial<Record<ScannerStatus, string>> = {
  denied:
    'Camera access is blocked. Allow the camera for this site in your browser settings, then tap Try again.',
  'no-camera':
    'No camera was found. Type the code below or use a hand-held scanner.',
  insecure:
    'The camera only works on a secure (https) connection. Type the code below instead.',
  unsupported:
    "This browser can't read codes from the camera. Type the code below instead.",
  error:
    'The camera could not start. Close other apps that use it and try again.',
};

export function Scanner({
  onCode,
  busy = false,
  autoStart = true,
  wasmBase,
}: {
  onCode: (code: string) => void;
  busy?: boolean;
  autoStart?: boolean;
  wasmBase?: string;
}) {
  const [cameraOn, setCameraOn] = useState(autoStart);
  const [manual, setManual] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const { videoRef, status, torch, toggleTorch, restart } = useScanner({
    enabled: cameraOn,
    onDetect: onCode,
    wasmBase,
  });
  const failed = Boolean(STATUS_MESSAGES[status]);

  useEffect(() => {
    if (window.matchMedia('(pointer: fine)').matches) inputRef.current?.focus();
  }, []);

  function submit(event: FormEvent) {
    event.preventDefault();
    const code = manual.trim();
    if (!code) return;
    onCode(code);
    setManual('');
  }

  return (
    <Stack gap="md">
      {cameraOn && !failed ? (
        <Box
          pos="relative"
          bg="black"
          style={{
            aspectRatio: '4 / 3',
            borderRadius: 'var(--mantine-radius-md)',
            overflow: 'hidden',
          }}
        >
          <video
            ref={videoRef}
            playsInline
            muted
            aria-label="Camera view"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
          <Box
            pos="absolute"
            aria-hidden
            style={{
              inset: '18%',
              border: '3px solid rgba(255, 255, 255, 0.85)',
              borderRadius: 'var(--mantine-radius-md)',
              boxShadow: '0 0 0 100vmax rgba(0, 0, 0, 0.25)',
            }}
          />
          {status === 'starting' || busy ? (
            <Loader
              color="white"
              pos="absolute"
              top="50%"
              left="50%"
              style={{ transform: 'translate(-50%, -50%)' }}
            />
          ) : null}
        </Box>
      ) : null}
      {cameraOn && failed ? (
        <Alert color="orange">{STATUS_MESSAGES[status]}</Alert>
      ) : null}
      <Group grow>
        {cameraOn && failed ? (
          <Button size="lg" onClick={restart}>
            Try again
          </Button>
        ) : null}
        <Button
          size="lg"
          variant={cameraOn ? 'default' : 'filled'}
          onClick={() => setCameraOn((on) => !on)}
        >
          {cameraOn ? 'Stop camera' : 'Start camera'}
        </Button>
        {cameraOn && torch.supported ? (
          <Button
            size="lg"
            variant="default"
            onClick={() => void toggleTorch()}
          >
            {torch.on ? 'Light off' : 'Light on'}
          </Button>
        ) : null}
      </Group>
      <form onSubmit={submit}>
        <Group align="flex-end" wrap="nowrap" gap="sm">
          <TextInput
            size="lg"
            label="Type or scan a code"
            description="Hand-held scanners type here and press Enter."
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            enterKeyHint="search"
            ref={inputRef}
            value={manual}
            onChange={(e) => setManual(e.currentTarget.value)}
            style={{ flex: 1 }}
          />
          <Button
            type="submit"
            size="lg"
            loading={busy}
            disabled={!manual.trim()}
          >
            Find
          </Button>
        </Group>
      </form>
    </Stack>
  );
}
