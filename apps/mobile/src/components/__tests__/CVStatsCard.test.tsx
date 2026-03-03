import React from 'react';
import { render } from '@testing-library/react-native';
import { CVStatsCard } from '../CVStatsCard';
import { DetectorOutput } from '../../cv/types';

function makeOutput(overrides: Partial<DetectorOutput> = {}): DetectorOutput {
  return {
    exerciseType: 'squat',
    repCount: 5,
    formScore: 88,
    confidence: 0.9,
    flags: [],
    reps: [],
    elapsedMs: 12000,
    ...overrides,
  };
}

describe('CVStatsCard', () => {
  it('renders the card', () => {
    const { getByTestId } = render(<CVStatsCard output={makeOutput()} />);
    expect(getByTestId('cv-stats-card')).toBeTruthy();
  });

  describe('rep-counted exercises', () => {
    it('shows rep-count block, not hold-time block', () => {
      const { getByTestId, queryByTestId } = render(
        <CVStatsCard output={makeOutput({ exerciseType: 'squat', repCount: 7 })} />,
      );
      expect(getByTestId('rep-count-block')).toBeTruthy();
      expect(queryByTestId('hold-time-block')).toBeNull();
    });

    it('displays the correct rep count', () => {
      const { getByText } = render(
        <CVStatsCard output={makeOutput({ repCount: 12 })} />,
      );
      expect(getByText('12')).toBeTruthy();
    });

    it('shows the form score bar', () => {
      const { getByTestId } = render(
        <CVStatsCard output={makeOutput({ formScore: 75 })} />,
      );
      expect(getByTestId('form-score-bar')).toBeTruthy();
    });

    it('form-score-bar width reflects formScore', () => {
      const { getByTestId } = render(
        <CVStatsCard output={makeOutput({ formScore: 60 })} />,
      );
      expect(getByTestId('form-score-bar').props.style).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ width: '60%' }),
        ]),
      );
    });
  });

  describe('plank (hold exercise)', () => {
    it('shows hold-time block, not rep-count block', () => {
      const { getByTestId, queryByTestId } = render(
        <CVStatsCard
          output={makeOutput({ exerciseType: 'plank', repCount: 0, elapsedMs: 30000 })}
        />,
      );
      expect(getByTestId('hold-time-block')).toBeTruthy();
      expect(queryByTestId('rep-count-block')).toBeNull();
    });

    it('formats hold time in seconds', () => {
      const { getByText } = render(
        <CVStatsCard
          output={makeOutput({ exerciseType: 'plank', elapsedMs: 45000 })}
        />,
      );
      expect(getByText('45s')).toBeTruthy();
    });

    it('formats hold time with minutes when >= 60 s', () => {
      const { getByText } = render(
        <CVStatsCard
          output={makeOutput({ exerciseType: 'plank', elapsedMs: 90000 })}
        />,
      );
      expect(getByText('1m 30s')).toBeTruthy();
    });

    it('does not render the form-score bar', () => {
      const { queryByTestId } = render(
        <CVStatsCard
          output={makeOutput({ exerciseType: 'plank', repCount: 0 })}
        />,
      );
      expect(queryByTestId('form-score-bar')).toBeNull();
    });
  });

  describe('confidence display', () => {
    it('shows confidence as a percentage', () => {
      const { getByText } = render(
        <CVStatsCard output={makeOutput({ confidence: 0.73 })} />,
      );
      expect(getByText('73%')).toBeTruthy();
    });
  });

  describe('flags', () => {
    it('renders no flags row when flags is empty', () => {
      const { queryByTestId } = render(
        <CVStatsCard output={makeOutput({ flags: [] })} />,
      );
      expect(queryByTestId('flags-row')).toBeNull();
    });

    it('renders a flags row when flags are present', () => {
      const { getByTestId } = render(
        <CVStatsCard
          output={makeOutput({ flags: ['LOW_CONFIDENCE', 'PARTIAL_ROM'] })}
        />,
      );
      expect(getByTestId('flags-row')).toBeTruthy();
    });

    it('renders human-readable flag labels', () => {
      const { getByText } = render(
        <CVStatsCard
          output={makeOutput({ flags: ['INSUFFICIENT_DEPTH'] })}
        />,
      );
      expect(getByText('Insufficient depth')).toBeTruthy();
    });
  });

  describe('sit_to_stand', () => {
    it('shows rep count (not hold time) for sit_to_stand', () => {
      const { getByTestId, queryByTestId } = render(
        <CVStatsCard
          output={makeOutput({ exerciseType: 'sit_to_stand', repCount: 3 })}
        />,
      );
      expect(getByTestId('rep-count-block')).toBeTruthy();
      expect(queryByTestId('hold-time-block')).toBeNull();
    });
  });
});
