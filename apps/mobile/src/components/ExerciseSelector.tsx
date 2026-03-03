import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ExerciseType, EXERCISE_LABELS } from '../cv/types';

const ALL_EXERCISES: ExerciseType[] = ['squat', 'pushup', 'plank', 'sit_to_stand'];

interface Props {
  selected: ExerciseType;
  onSelect: (type: ExerciseType) => void;
  disabled?: boolean;
}

export function ExerciseSelector({ selected, onSelect, disabled = false }: Props) {
  return (
    <View>
      <Text style={styles.label}>Exercise type</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {ALL_EXERCISES.map((type) => {
          const isSelected = type === selected;
          return (
            <TouchableOpacity
              key={type}
              testID={`exercise-option-${type}`}
              style={[styles.chip, isSelected && styles.chipSelected]}
              onPress={() => onSelect(type)}
              disabled={disabled}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected, disabled }}
              accessibilityLabel={EXERCISE_LABELS[type]}
            >
              <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                {EXERCISE_LABELS[type]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 4,
  },
  chip: {
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
  },
  chipSelected: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  chipText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  chipTextSelected: {
    color: '#fff',
    fontWeight: '700',
  },
});
