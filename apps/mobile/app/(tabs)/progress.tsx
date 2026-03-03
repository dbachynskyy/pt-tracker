import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { api, Session, SessionStatus } from '../../src/api/client';

const STATUS_COLOR: Record<SessionStatus, string> = {
  completed: '#059669',
  in_progress: '#D97706',
  skipped: '#6B7280',
};

const PAGE_SIZE = 15;

export default function ProgressScreen() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // filter state
  const [filterInput, setFilterInput] = useState('');
  const [activeFilter, setActiveFilter] = useState('');
  const filterRef = useRef('');

  const fetchPage = useCallback(async (p: number, filter: string, replace: boolean) => {
    try {
      const data = await api.listSessions({
        page: p,
        page_size: PAGE_SIZE,
        exercise_type: filter || undefined,
      });
      setSessions((prev) => (replace ? data.items : [...prev, ...data.items]));
      setTotal(data.total);
      setPage(p);
      setHasMore(data.has_more);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load sessions');
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    await fetchPage(1, filterRef.current, true);
    setLoading(false);
  }, [fetchPage]);

  useEffect(() => {
    load();
  }, [load]);

  const applyFilter = () => {
    filterRef.current = filterInput;
    setActiveFilter(filterInput);
    setError(null);
    setLoading(true);
    fetchPage(1, filterInput, true).finally(() => setLoading(false));
  };

  const clearFilter = () => {
    setFilterInput('');
    filterRef.current = '';
    setActiveFilter('');
    setError(null);
    setLoading(true);
    fetchPage(1, '', true).finally(() => setLoading(false));
  };

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    await fetchPage(page + 1, filterRef.current, false);
    setLoadingMore(false);
  };

  const completedCount = sessions.filter((s) => s.status === 'completed').length;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Your Progress</Text>

      {/* filter bar */}
      <View style={styles.filterRow}>
        <TextInput
          style={styles.filterInput}
          placeholder="Filter by exercise…"
          placeholderTextColor="#9CA3AF"
          value={filterInput}
          onChangeText={setFilterInput}
          onSubmitEditing={applyFilter}
          returnKeyType="search"
        />
        <TouchableOpacity style={styles.filterBtn} onPress={applyFilter}>
          <Text style={styles.filterBtnText}>Go</Text>
        </TouchableOpacity>
        {activeFilter ? (
          <TouchableOpacity style={styles.clearBtn} onPress={clearFilter}>
            <Text style={styles.clearBtnText}>✕</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {activeFilter ? (
        <Text style={styles.activeFilterLabel}>
          Showing results for "{activeFilter}"
        </Text>
      ) : null}

      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={load}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : sessions.length === 0 ? (
        <Text style={styles.empty}>
          {activeFilter ? 'No sessions match that filter.' : 'No sessions yet — start one!'}
        </Text>
      ) : (
        <>
          <Text style={styles.summary}>
            {activeFilter
              ? `${total} matching · ${completedCount} completed`
              : `${total} total · ${completedCount} completed`}
          </Text>

          <FlatList
            data={sessions}
            keyExtractor={(s) => s.id}
            renderItem={({ item }) => (
              <View style={styles.card}>
                <View style={styles.cardRow}>
                  <Text style={styles.date}>
                    {new Date(item.created_at).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </Text>
                  <Text style={[styles.status, { color: STATUS_COLOR[item.status] }]}>
                    {item.status.replace('_', ' ')}
                  </Text>
                </View>
                <Text style={styles.exercises}>
                  {item.exercises_completed.length > 0
                    ? item.exercises_completed.map((e) => e.exercise_name).join(', ')
                    : 'No exercises logged'}
                  {item.pain_level != null ? ` · pain ${item.pain_level}/10` : ''}
                </Text>
              </View>
            )}
            ListFooterComponent={
              hasMore ? (
                <TouchableOpacity style={styles.loadMoreBtn} onPress={loadMore} disabled={loadingMore}>
                  {loadingMore ? (
                    <ActivityIndicator color="#2563EB" />
                  ) : (
                    <Text style={styles.loadMoreText}>Load more</Text>
                  )}
                </TouchableOpacity>
              ) : null
            }
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#F9FAFB' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 26, fontWeight: '700', marginTop: 16, marginBottom: 12, color: '#111827' },

  filterRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  filterInput: {
    flex: 1,
    height: 40,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#111827',
  },
  filterBtn: {
    backgroundColor: '#2563EB',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  filterBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  clearBtn: {
    backgroundColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  clearBtnText: { color: '#374151', fontWeight: '600', fontSize: 13 },
  activeFilterLabel: { fontSize: 12, color: '#6B7280', marginBottom: 8 },

  errorBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  errorText: { color: '#DC2626', fontSize: 13, flex: 1 },
  retryText: { color: '#2563EB', fontSize: 13, fontWeight: '600', marginLeft: 8 },

  summary: { fontSize: 13, color: '#6B7280', marginBottom: 12 },
  empty: { color: '#6B7280', fontSize: 16, textAlign: 'center', marginTop: 40 },

  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  date: { fontSize: 15, fontWeight: '600', color: '#111827' },
  status: { fontSize: 13, fontWeight: '600', textTransform: 'capitalize' },
  exercises: { fontSize: 13, color: '#6B7280' },

  loadMoreBtn: {
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 4,
  },
  loadMoreText: { color: '#2563EB', fontWeight: '600', fontSize: 14 },
});
