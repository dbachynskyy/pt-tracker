import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ExerciseSelector } from '../ExerciseSelector';
import { ExerciseType, EXERCISE_LABELS } from '../../cv/types';

describe('ExerciseSelector', () => {
  const exercises: ExerciseType[] = Object.keys(EXERCISE_LABELS) as ExerciseType[];

  it('renders a button for each supported exercise type', () => {
    const { getByTestId } = render(
      <ExerciseSelector selected="squat" onSelect={jest.fn()} />,
    );
    for (const ex of exercises) {
      expect(getByTestId(`exercise-option-${ex}`)).toBeTruthy();
    }
  });

  it('marks the selected exercise as selected', () => {
    const { getByTestId } = render(
      <ExerciseSelector selected="plank" onSelect={jest.fn()} />,
    );
    expect(getByTestId('exercise-option-plank').props.accessibilityState.selected).toBe(true);
    expect(getByTestId('exercise-option-squat').props.accessibilityState.selected).toBe(false);
  });

  it('calls onSelect with the tapped exercise type', () => {
    const onSelect = jest.fn();
    const { getByTestId } = render(
      <ExerciseSelector selected="squat" onSelect={onSelect} />,
    );
    fireEvent.press(getByTestId('exercise-option-knee_extension'));
    expect(onSelect).toHaveBeenCalledWith('knee_extension');
  });

  it('does not call onSelect when disabled', () => {
    const onSelect = jest.fn();
    const { getByTestId } = render(
      <ExerciseSelector selected="squat" onSelect={onSelect} disabled />,
    );
    fireEvent.press(getByTestId('exercise-option-pushup'));
    expect(onSelect).not.toHaveBeenCalled();
  });
});
