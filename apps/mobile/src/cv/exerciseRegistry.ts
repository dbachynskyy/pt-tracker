import type { ExerciseAnalyzer } from './repCounter';
import { SquatAnalyzer } from './exercises/squat';
import { PushupAnalyzer } from './exercises/pushup';
import { SitToStandAnalyzer } from './exercises/sitToStand';
import { LungeAnalyzer } from './exercises/lunge';
import { CalfRaiseAnalyzer } from './exercises/calfRaise';
import { GluteBridgeAnalyzer } from './exercises/gluteBridge';
import { ShoulderAbductionAnalyzer } from './exercises/shoulderAbduction';
import { HeelRaiseAnalyzer } from './exercises/heelRaise';
import { KneeExtensionAnalyzer } from './exercises/kneeExtension';
import { PlankHoldAnalyzer } from './exercises/plankHold';

export const EXERCISE_IDS = [
  'squat',
  'pushup',
  'sit_to_stand',
  'lunge',
  'calf_raise',
  'glute_bridge',
  'shoulder_abduction',
  'heel_raise',
  'knee_extension',
  'plank_hold',
] as const;

export type ExerciseId = (typeof EXERCISE_IDS)[number];

export const EXERCISE_LABELS: Record<ExerciseId, string> = {
  squat: 'Squat',
  pushup: 'Push-up',
  sit_to_stand: 'Sit to Stand',
  lunge: 'Lunge',
  calf_raise: 'Calf Raise',
  glute_bridge: 'Glute Bridge',
  shoulder_abduction: 'Shoulder Abduction',
  heel_raise: 'Heel Raise',
  knee_extension: 'Knee Extension',
  plank_hold: 'Plank Hold',
};

export function normalizeExerciseId(id: string): ExerciseId {
  if (id === 'plank') return 'plank_hold';
  if ((EXERCISE_IDS as readonly string[]).includes(id)) return id as ExerciseId;
  return 'squat';
}

export function createAnalyzer(id: ExerciseId): ExerciseAnalyzer {
  switch (id) {
    case 'squat': return new SquatAnalyzer();
    case 'pushup': return new PushupAnalyzer();
    case 'sit_to_stand': return new SitToStandAnalyzer();
    case 'lunge': return new LungeAnalyzer();
    case 'calf_raise': return new CalfRaiseAnalyzer();
    case 'glute_bridge': return new GluteBridgeAnalyzer();
    case 'shoulder_abduction': return new ShoulderAbductionAnalyzer();
    case 'heel_raise': return new HeelRaiseAnalyzer();
    case 'knee_extension': return new KneeExtensionAnalyzer();
    case 'plank_hold': return new PlankHoldAnalyzer();
  }
}
