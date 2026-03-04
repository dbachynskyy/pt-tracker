import { EXERCISE_IDS } from '../exerciseRegistry';
import { READINESS_THRESHOLDS, THRESHOLD_PROFILE_VERSION } from '../readinessThresholds';
import { aggregateReadinessFailures, validateOrionReadinessArtifact } from '../readinessReport';

describe('readiness thresholds coverage', () => {
  it('has canonical threshold coverage for all 10 exercises', () => {
    expect(EXERCISE_IDS).toHaveLength(10);
    expect(Object.keys(READINESS_THRESHOLDS).sort()).toEqual([...EXERCISE_IDS].sort());
    expect(THRESHOLD_PROFILE_VERSION).toMatch(/^readiness-thresholds\./);
  });

  it('validator fails when any exercise threshold config is missing', () => {
    const report = aggregateReadinessFailures([{ sessionId: 's', exercises: [] as any }]);
    const original = (READINESS_THRESHOLDS as any).squat;
    delete (READINESS_THRESHOLDS as any).squat;
    const verdict = validateOrionReadinessArtifact(report as any);
    (READINESS_THRESHOLDS as any).squat = original;

    expect(verdict.ok).toBe(false);
    expect(verdict.errors).toContain('MISSING_EXERCISE_THRESHOLD:squat');
  });
});
