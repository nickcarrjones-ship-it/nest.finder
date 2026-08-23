import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { colors } from '../theme';
import { configureGoogleSignIn } from '../store/authStore';
import { GOOGLE_WEB_CLIENT_ID } from '../lib/googleSignInConfig';

export default function RootLayout() {
  useEffect(() => {
    configureGoogleSignIn(GOOGLE_WEB_CLIENT_ID);
  }, []);

  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.cream },
        }}
      >
        <Stack.Screen name="(tabs)" />
      </Stack>
    </>
  );
}
