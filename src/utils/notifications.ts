import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Configuration par défaut du gestionnaire de notifications d'Expo
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/**
 * Demande les permissions d'affichage des notifications locales à l'utilisateur.
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  
  return finalStatus === 'granted';
}

/**
 * Planifie une notification locale de rappel de vaccin pour un patient à la date spécifiée (le matin à 9h).
 */
export async function scheduleVaccinationReminder(
  patientName: string,
  vaccineName: string,
  dateRecallStr: string
): Promise<string | null> {
  if (Platform.OS === 'web') return null;

  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) return null;

  const triggerDate = new Date(dateRecallStr);
  triggerDate.setHours(9, 0, 0, 0); // Rappel à 9:00 AM

  if (triggerDate.getTime() <= Date.now()) {
    // Ne pas planifier de rappel dans le passé
    return null;
  }

  const identifier = await Notifications.scheduleNotificationAsync({
    content: {
      title: '💉 Rappel Vaccinal • MedRecord',
      body: `Rappel de vaccin "${vaccineName}" à administrer aujourd'hui au patient ${patientName}.`,
      sound: true,
    },
    trigger: triggerDate,
  });

  return identifier;
}

/**
 * Planifie une notification locale pour rappeler un rendez-vous (2 heures à l'avance).
 */
export async function scheduleAppointmentReminder(
  patientName: string,
  dateHeureStr: string
): Promise<string | null> {
  if (Platform.OS === 'web') return null;

  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) return null;

  const triggerDate = new Date(dateHeureStr);
  // Rappel 2 heures avant le rendez-vous
  const reminderTime = triggerDate.getTime() - 2 * 60 * 60 * 1000;

  if (reminderTime <= Date.now()) {
    // Si le rendez-vous est dans moins de 2 heures, pas de planification dans le passé
    return null;
  }

  const identifier = await Notifications.scheduleNotificationAsync({
    content: {
      title: '📅 Rappel de Consultation • MedRecord',
      body: `Rendez-vous programmé avec le patient ${patientName} à ${triggerDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} (dans 2 heures).`,
      sound: true,
    },
    trigger: new Date(reminderTime),
  });

  return identifier;
}
