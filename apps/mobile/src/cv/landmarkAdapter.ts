import type { Landmark, PoseFrame, FrameSource } from './repCounter';

export interface RawLandmark {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
}

export interface RawPoseSample {
  landmarks: RawLandmark[];
  confidence?: number;
  source?: FrameSource;
  timestampMs?: number;
}

export interface PoseProvider {
  start(onSample: (sample: RawPoseSample) => void): void | Promise<void>;
  stop(): void | Promise<void>;
}

export interface AdapterConfig {
  smoothing: {
    method: 'ema' | 'window';
    alpha: number;
    windowSize: number;
  };
  occlusion: {
    visibilityThreshold: number;
    minVisibleLandmarks: number;
    maxConsecutiveOccludedFrames: number;
  };
}

const DEFAULTS: AdapterConfig = {
  smoothing: { method: 'ema', alpha: 0.35, windowSize: 3 },
  occlusion: { visibilityThreshold: 0.5, minVisibleLandmarks: 8, maxConsecutiveOccludedFrames: 3 },
};

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

export class LandmarkAdapter {
  private cfg: AdapterConfig;
  private emaState: Landmark[] | null = null;
  private window: Landmark[][] = [];
  private occludedStreak = 0;

  constructor(config: Partial<AdapterConfig> = {}) {
    this.cfg = {
      smoothing: { ...DEFAULTS.smoothing, ...(config.smoothing ?? {}) },
      occlusion: { ...DEFAULTS.occlusion, ...(config.occlusion ?? {}) },
    };
  }

  adapt(sample: RawPoseSample): PoseFrame {
    const source = sample.source ?? 'real';
    const normalized = this.normalize(sample.landmarks);
    const smoothed = this.cfg.smoothing.method === 'window'
      ? this.windowSmooth(normalized)
      : this.emaSmooth(normalized);

    const visibleCount = normalized.filter((lm) => (lm.visibility ?? 0) >= this.cfg.occlusion.visibilityThreshold).length;
    const occluded = visibleCount < this.cfg.occlusion.minVisibleLandmarks;
    if (occluded) this.occludedStreak += 1;
    else this.occludedStreak = 0;

    const gatedSource: FrameSource = this.occludedStreak > this.cfg.occlusion.maxConsecutiveOccludedFrames
      ? 'disconnected'
      : source;

    return Object.assign(smoothed, { source: gatedSource }) as PoseFrame;
  }

  reset(): void {
    this.emaState = null;
    this.window = [];
    this.occludedStreak = 0;
  }

  private normalize(raw: RawLandmark[]): Landmark[] {
    return Array.from({ length: 33 }, (_, i) => {
      const lm = raw[i] ?? { x: 0.5, y: 0.5, z: 0, visibility: 0 };
      return {
        x: clamp01(lm.x ?? 0.5),
        y: clamp01(lm.y ?? 0.5),
        z: lm.z ?? 0,
        visibility: clamp01(lm.visibility ?? 0),
      };
    });
  }

  private emaSmooth(frame: Landmark[]): Landmark[] {
    if (!this.emaState) {
      this.emaState = frame.map((lm) => ({ ...lm }));
      return frame.map((lm) => ({ ...lm }));
    }

    const a = this.cfg.smoothing.alpha;
    this.emaState = frame.map((lm, i) => {
      const prev = this.emaState![i];
      return {
        x: prev.x + a * (lm.x - prev.x),
        y: prev.y + a * (lm.y - prev.y),
        z: prev.z + a * (lm.z - prev.z),
        visibility: prev.visibility! + a * ((lm.visibility ?? 0) - prev.visibility!),
      };
    });

    return this.emaState.map((lm) => ({ ...lm }));
  }

  private windowSmooth(frame: Landmark[]): Landmark[] {
    this.window.push(frame.map((lm) => ({ ...lm })));
    const n = Math.max(1, this.cfg.smoothing.windowSize);
    if (this.window.length > n) this.window.shift();

    const out: Landmark[] = [];
    for (let i = 0; i < 33; i++) {
      let sx = 0, sy = 0, sz = 0, sv = 0;
      for (const f of this.window) {
        sx += f[i].x; sy += f[i].y; sz += f[i].z; sv += f[i].visibility ?? 0;
      }
      const d = this.window.length;
      out.push({ x: sx / d, y: sy / d, z: sz / d, visibility: sv / d });
    }
    return out;
  }
}

export class CvLandmarkBridge {
  private running = false;
  constructor(
    private readonly provider: PoseProvider,
    private readonly adapter: LandmarkAdapter,
    private readonly onPoseFrame: (frame: PoseFrame, timestampMs?: number) => void,
  ) {}

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    await this.provider.start((sample) => {
      const frame = this.adapter.adapt(sample);
      this.onPoseFrame(frame, sample.timestampMs);
    });
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;
    await this.provider.stop();
    this.adapter.reset();
  }
}
