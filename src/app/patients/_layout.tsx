import { Stack } from 'expo-router';

export default function PatientsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="create" />
      <Stack.Screen name="[id]" />
      <Stack.Screen name="certificat_create" />
      <Stack.Screen name="consultation_create" />
      <Stack.Screen name="consultation_details" />
      <Stack.Screen name="ordonnance_create" />
    </Stack>
  );
}
