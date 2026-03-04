import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '../src/hooks/useAuth';
import { createNativePoseProvider } from '../src/cv/nativePoseProvider';
import { initializePoseProvider, registerPoseProvider } from '../src/cv/poseProvider';

export default function RootLayout() {
  useEffect(() => {
    registerPoseProvider(createNativePoseProvider());
    initializePoseProvider();
  }, []);

  return (
    <AuthProvider>
      <Stack>
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
      <StatusBar style="auto" />
    </AuthProvider>
  );
}
