import { Stack } from 'expo-router';

export default function CertificatsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="create" />
    </Stack>
  );
}
