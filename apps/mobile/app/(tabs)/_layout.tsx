import { Redirect, Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TouchableOpacity } from 'react-native';
import { useAuth } from '../../src/hooks/useAuth';

export default function TabLayout() {
  const { token, logout } = useAuth();

  if (!token) return <Redirect href="/login" />;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#2563EB',
        headerRight: () => (
          <TouchableOpacity onPress={logout} style={{ marginRight: 16 }}>
            <Ionicons name="log-out-outline" size={22} color="#6B7280" />
          </TouchableOpacity>
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Today',
          tabBarIcon: ({ color }) => <Ionicons name="today-outline" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="session"
        options={{
          title: 'Session',
          tabBarIcon: ({ color }) => <Ionicons name="barbell-outline" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          title: 'Progress',
          tabBarIcon: ({ color }) => <Ionicons name="stats-chart-outline" size={24} color={color} />,
        }}
      />
    </Tabs>
  );
}
