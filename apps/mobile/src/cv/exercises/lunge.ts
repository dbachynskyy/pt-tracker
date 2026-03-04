import type { ExerciseAnalyzer, FormFlag, PoseFrame, RepCandidate } from "../repCounter";

const LM = { LEFT_HIP: 23, RIGHT_HIP: 24, LEFT_KNEE: 25, RIGHT_KNEE: 26, LEFT_ANKLE: 27, RIGHT_ANKLE: 28 } as const;
const CFG = { UP: 160, DOWN: 95, MIN_MS: 800, ASYM_DEG: 18 } as const;
type Phase = "UP" | "DOWN" | "SEEKING_DOWN";

function angleDeg(a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }): number {
  const ab = { x: a.x - b.x, y: a.y - b.y };
  const cb = { x: c.x - b.x, y: c.y - b.y };
  const dot = ab.x * cb.x + ab.y * cb.y;
  const mag = Math.sqrt(ab.x ** 2 + ab.y ** 2) * Math.sqrt(cb.x ** 2 + cb.y ** 2);
  if (mag === 0) return 0;
  return (Math.acos(Math.min(1, Math.max(-1, dot / mag))) * 180) / Math.PI;
}

function snap(frame: PoseFrame): number[] {
  return [LM.LEFT_HIP, LM.RIGHT_HIP, LM.LEFT_KNEE, LM.RIGHT_KNEE, LM.LEFT_ANKLE, LM.RIGHT_ANKLE]
    .flatMap((i) => [Math.round((frame[i]?.x ?? 0) * 1000) / 1000, Math.round((frame[i]?.y ?? 0) * 1000) / 1000]);
}

export class LungeAnalyzer implements ExerciseAnalyzer {
  readonly exerciseId = "lunge";
  readonly requiredLandmarks = [LM.LEFT_HIP, LM.RIGHT_HIP, LM.LEFT_KNEE, LM.RIGHT_KNEE, LM.LEFT_ANKLE, LM.RIGHT_ANKLE];
  private phase: Phase = "UP";
  private repStart = 0;
  private minAngle = 180;
  private flags: FormFlag[] = [];

  processFrame(frame: PoseFrame, sessionMs: number): RepCandidate | null {
    const r = angleDeg(frame[LM.RIGHT_HIP], frame[LM.RIGHT_KNEE], frame[LM.RIGHT_ANKLE]);
    const l = angleDeg(frame[LM.LEFT_HIP], frame[LM.LEFT_KNEE], frame[LM.LEFT_ANKLE]);
    const knee = Math.min(l, r);
    if (Math.abs(l - r) > CFG.ASYM_DEG && !this.flags.includes("ASYMMETRIC_HIPS")) this.flags.push("ASYMMETRIC_HIPS");

    if (this.phase === "UP") {
      if (knee < CFG.DOWN) {
        this.phase = "DOWN"; this.repStart = sessionMs; this.minAngle = knee;
      } else if (knee < CFG.UP) {
        this.phase = "SEEKING_DOWN"; this.repStart = sessionMs; this.minAngle = knee;
      }
      return null;
    }

    this.minAngle = Math.min(this.minAngle, knee);
    if (this.phase === "SEEKING_DOWN") {
      if (knee < CFG.DOWN) this.phase = "DOWN";
      else if (knee >= CFG.UP) {
        const f: FormFlag[] = [...this.flags, "PARTIAL_ROM"];
        const d = sessionMs - this.repStart;
        if (d < CFG.MIN_MS) f.push("TOO_FAST");
        this.reset();
        return { durationMs: d, formScore: Math.max(0, 100 - f.length * 20), flags: f, auditSnapshot: snap(frame) };
      }
      return null;
    }

    if (knee >= CFG.UP) {
      const f = [...this.flags];
      const d = sessionMs - this.repStart;
      if (this.minAngle > CFG.DOWN) f.push("PARTIAL_ROM");
      if (d < CFG.MIN_MS) f.push("TOO_FAST");
      this.reset();
      return { durationMs: d, formScore: Math.max(0, 100 - f.length * 20), flags: f, auditSnapshot: snap(frame) };
    }
    return null;
  }

  reset(): void { this.phase = "UP"; this.repStart = 0; this.minAngle = 180; this.flags = []; }
}
