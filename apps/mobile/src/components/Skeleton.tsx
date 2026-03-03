import { useEffect, useRef } from 'react';
import { Animated, DimensionValue, StyleSheet, View } from 'react-native';

interface SkeletonProps {
  width?: DimensionValue;
  height: number;
  borderRadius?: number;
  style?: object;
}

export function Skeleton({ width = '100%', height, borderRadius = 8, style }: SkeletonProps) {
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);

  return (
    <Animated.View style={[{ width, height, borderRadius, backgroundColor: '#E5E7EB', opacity }, style]} />
  );
}

// ── Pre-built skeleton layouts ─────────────────────────────────────────────

export function DashboardSkeleton() {
  return (
    <View>
      {/* stat cards row */}
      <View style={styles.statRow}>
        <Skeleton height={72} style={styles.statCard} />
        <Skeleton height={72} style={styles.statCard} />
        <Skeleton height={72} style={styles.statCard} />
      </View>
      {/* plan name */}
      <Skeleton width="55%" height={20} borderRadius={6} style={{ marginBottom: 14 }} />
      {/* exercise rows */}
      {[1, 2, 3].map((i) => (
        <View key={i} style={styles.exerciseCard}>
          <Skeleton width="50%" height={16} borderRadius={5} />
          <Skeleton width="25%" height={14} borderRadius={5} />
        </View>
      ))}
    </View>
  );
}

export function SessionListSkeleton() {
  return (
    <View>
      {[1, 2, 3, 4, 5].map((i) => (
        <View key={i} style={styles.sessionCard}>
          <View style={styles.sessionCardRow}>
            <Skeleton width="38%" height={15} borderRadius={5} />
            <Skeleton width="22%" height={13} borderRadius={5} />
          </View>
          <Skeleton width="65%" height={13} borderRadius={5} style={{ marginTop: 8 }} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  statRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  statCard: { flex: 1, borderRadius: 12 },

  exerciseCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },

  sessionCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  sessionCardRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
});
