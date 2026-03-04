import { EXERCISE_IDS, createAnalyzer } from '../exerciseRegistry';

describe('exercise runtime coverage contract', () => {
  it('keeps canonical coverage at 10/10 with analyzer mapping for each id', () => {
    expect(EXERCISE_IDS).toHaveLength(10);
    for (const id of EXERCISE_IDS) {
      const analyzer = createAnalyzer(id);
      expect(analyzer).toBeTruthy();
      expect(analyzer.exerciseId).toBe(id);
    }
  });
});
