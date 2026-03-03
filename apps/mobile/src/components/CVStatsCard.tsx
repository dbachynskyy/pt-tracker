import { StyleSheet, Text, View } from 'react-native';
import { ConfidenceFlag, DetectorOutput, EXERCISE_LABELS, FLAG_LABELS, HOLD_EXERCISES } from '../cv/types';

interface Props {
  output: DetectorOutput;
}

function formatHoldTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

function confidenceColor(confidence: number): string {
  if (confidence >= 0.8) return '#059669';
  if (confidence >= 0.4) return '#D97706';
  return '#DC2626';
}

function flagColor(flag: ConfidenceFlag): string {
  return flag === 'LOW_CONFIDENCE' ? '#6B7280' : '#D97706';
}

export function CVStatsCard({ output }: Props) {
  const isHold = HOLD_EXERCISES.has(output.exerciseType);
  const confPct = Math.round(output.confidence * 100);
  const formBarWidth = `${output.formScore}%` as const;

  const formBarColor =
    output.formScore >= 80 ? '#059669' : output.formScore >= 60 ? '#D97706' : '#DC2626';

  return (
    <View style={styles.card} testID="cv-stats-card">
      <Text style={styles.exerciseName}>
        {EXERCISE_LABELS[output.exerciseType]}
      </Text>

      {/* Primary metric */}
      <View style={styles.metricRow}>
        {isHold ? (
          <View style={styles.metricBlock} testID="hold-time-block">
            <Text style={styles.metricValue}>{formatHoldTime(output.elapsedMs)}</Text>
            <Text style={styles.metricLabel}>Hold time</Text>
          </View>
        ) : (
          <View style={styles.metricBlock} testID="rep-count-block">
            <Text style={styles.metricValue}>{output.repCount}</Text>
            <Text style={styles.metricLabel}>Reps</Text>
          </View>
        )}

        {/* Confidence */}
        <View style={[styles.metricBlock, styles.metricBlockRight]}>
          <Text style={[styles.metricValue, { color: confidenceColor(output.confidence) }]}>
            {confPct}%
          </Text>
          <Text style={styles.metricLabel}>Confidence</Text>
        </View>
      </View>

      {/* Form score bar */}
      {!isHold && (
        <View style={styles.formSection}>
          <View style={styles.formLabelRow}>
            <Text style={styles.formLabel}>Form score</Text>
            <Text style={[styles.formScore, { color: formBarColor }]}>
              {output.formScore}/100
            </Text>
          </View>
          <View style={styles.formBarBg}>
            <View
              testID="form-score-bar"
              style={[styles.formBarFill, { width: formBarWidth, backgroundColor: formBarColor }]}
            />
          </View>
        </View>
      )}

      {/* Flags */}
      {output.flags.length > 0 && (
        <View style={styles.flagsRow} testID="flags-row">
          {output.flags.map((flag) => (
            <View key={flag} style={[styles.flagPill, { borderColor: flagColor(flag) }]}>
              <Text style={[styles.flagText, { color: flagColor(flag) }]}>
                {FLAG_LABELS[flag]}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginVertical: 12,
  },
  exerciseName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 14,
  },
  metricRow: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  metricBlock: {
    flex: 1,
  },
  metricBlockRight: {
    alignItems: 'flex-end',
  },
  metricValue: {
    fontSize: 36,
    fontWeight: '800',
    color: '#111827',
    lineHeight: 40,
  },
  metricLabel: {
    fontSize: 12,
    color: '#9CA3AF',
    fontWeight: '500',
    textTransform: 'uppercase',
    marginTop: 2,
  },
  formSection: {
    marginBottom: 12,
  },
  formLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  formLabel: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
  },
  formScore: {
    fontSize: 13,
    fontWeight: '700',
  },
  formBarBg: {
    height: 6,
    backgroundColor: '#F3F4F6',
    borderRadius: 3,
    overflow: 'hidden',
  },
  formBarFill: {
    height: 6,
    borderRadius: 3,
  },
  flagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  flagPill: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  flagText: {
    fontSize: 11,
    fontWeight: '600',
  },
});
