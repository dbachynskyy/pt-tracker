import { View, Text, StyleSheet } from 'react-native';

export default function SessionScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Active Session</Text>
      <Text style={styles.placeholder}>Exercise tracking coming soon</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 12 },
  placeholder: { color: '#6B7280', fontSize: 16 },
});
