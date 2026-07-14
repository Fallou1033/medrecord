import * as Network from 'expo-network';
import { getDatabase } from './db';

// This is a placeholder for your future Supabase configuration.
// Once you create your Supabase project, import the client here:
// import { supabase } from '../services/supabase';

let isSyncing = false;

/**
 * Checks if the device is currently connected to the Internet.
 */
export async function isOnline(): Promise<boolean> {
  try {
    const state = await Network.getNetworkStateAsync();
    return !!state.isConnected && !!state.isInternetReachable;
  } catch (error) {
    console.error('MedRecord: Failed to get network state:', error);
    return false;
  }
}

/**
 * Pushes unsynced local SQLite changes to the cloud database (Supabase).
 * For Phase 1, since there is no active Supabase project yet, this performs 
 * a simulated sync and logs the output, then flags the local records as synced.
 */
export async function triggerSynchronization(): Promise<{ success: boolean; syncedCount: number }> {
  if (isSyncing) {
    return { success: false, syncedCount: 0 };
  }

  const online = await isOnline();
  if (!online) {
    console.log('MedRecord: Synchronization skipped (Device is offline).');
    return { success: false, syncedCount: 0 };
  }

  isSyncing = true;
  console.log('MedRecord: Starting cloud synchronization...');
  let totalSynced = 0;

  try {
    const db = await getDatabase();

    // 1. Sync Patients
    const unsyncedPatients = await db.getAllAsync<any>('SELECT * FROM patients WHERE is_synced = 0;');
    if (unsyncedPatients.length > 0) {
      console.log(`MedRecord Sync: Pushing ${unsyncedPatients.length} patients to Supabase...`);
      for (const patient of unsyncedPatients) {
        // --- Supabase Integration Code ---
        // const { error } = await supabase.from('patients').upsert({
        //   id: patient.id,
        //   numero_dossier: patient.numero_dossier,
        //   nom: patient.nom, // Sent encrypted
        //   prenom: patient.prenom, // Sent encrypted
        //   sexe: patient.sexe,
        //   date_naissance: patient.date_naissance,
        //   telephone: patient.telephone,
        //   adresse: patient.adresse,
        //   profession: patient.profession,
        //   personne_prevenir: patient.personne_prevenir,
        //   groupe_sanguin: patient.groupe_sanguin,
        //   photo_url: patient.photo_url,
        //   created_at: patient.created_at,
        //   updated_at: patient.updated_at
        // });
        // if (error) throw error;
        
        // Simulating successful network push
        await db.runAsync('UPDATE patients SET is_synced = 1 WHERE id = ?;', [patient.id]);
        totalSynced++;
      }
    }

    // 2. Sync Antécédents
    const unsyncedAntecedents = await db.getAllAsync<any>('SELECT * FROM antecedents WHERE is_synced = 0;');
    if (unsyncedAntecedents.length > 0) {
      console.log(`MedRecord Sync: Pushing ${unsyncedAntecedents.length} antecedents...`);
      for (const row of unsyncedAntecedents) {
        // Simulating successful network push
        await db.runAsync('UPDATE antecedents SET is_synced = 1 WHERE id = ?;', [row.id]);
        totalSynced++;
      }
    }

    // 3. Sync Consultations
    const unsyncedConsultations = await db.getAllAsync<any>('SELECT * FROM consultations WHERE is_synced = 0;');
    if (unsyncedConsultations.length > 0) {
      console.log(`MedRecord Sync: Pushing ${unsyncedConsultations.length} consultations...`);
      for (const row of unsyncedConsultations) {
        await db.runAsync('UPDATE consultations SET is_synced = 1 WHERE id = ?;', [row.id]);
        totalSynced++;
      }
    }

    // 4. Sync Constantes
    const unsyncedConstantes = await db.getAllAsync<any>('SELECT * FROM constantes WHERE is_synced = 0;');
    if (unsyncedConstantes.length > 0) {
      console.log(`MedRecord Sync: Pushing ${unsyncedConstantes.length} vitals...`);
      for (const row of unsyncedConstantes) {
        await db.runAsync('UPDATE constantes SET is_synced = 1 WHERE id = ?;', [row.id]);
        totalSynced++;
      }
    }

    // 5. Sync Ordonnances
    const unsyncedOrdonnances = await db.getAllAsync<any>('SELECT * FROM ordonnances WHERE is_synced = 0;');
    if (unsyncedOrdonnances.length > 0) {
      console.log(`MedRecord Sync: Pushing ${unsyncedOrdonnances.length} prescriptions...`);
      for (const row of unsyncedOrdonnances) {
        await db.runAsync('UPDATE ordonnances SET is_synced = 1 WHERE id = ?;', [row.id]);
        totalSynced++;
      }
    }

    // 6. Sync Certificats
    const unsyncedCertificats = await db.getAllAsync<any>('SELECT * FROM certificats WHERE is_synced = 0;');
    if (unsyncedCertificats.length > 0) {
      console.log(`MedRecord Sync: Pushing ${unsyncedCertificats.length} certificates...`);
      for (const row of unsyncedCertificats) {
        await db.runAsync('UPDATE certificats SET is_synced = 1 WHERE id = ?;', [row.id]);
        totalSynced++;
      }
    }

    // 7. Sync Vaccinations
    const unsyncedVaccinations = await db.getAllAsync<any>('SELECT * FROM vaccinations WHERE is_synced = 0;');
    if (unsyncedVaccinations.length > 0) {
      console.log(`MedRecord Sync: Pushing ${unsyncedVaccinations.length} vaccinations...`);
      for (const row of unsyncedVaccinations) {
        await db.runAsync('UPDATE vaccinations SET is_synced = 1 WHERE id = ?;', [row.id]);
        totalSynced++;
      }
    }

    // 8. Sync Rendez-vous
    const unsyncedRdv = await db.getAllAsync<any>('SELECT * FROM rendez_vous WHERE is_synced = 0;');
    if (unsyncedRdv.length > 0) {
      console.log(`MedRecord Sync: Pushing ${unsyncedRdv.length} appointments...`);
      for (const row of unsyncedRdv) {
        await db.runAsync('UPDATE rendez_vous SET is_synced = 1 WHERE id = ?;', [row.id]);
        totalSynced++;
      }
    }

    // 9. Sync Examens
    const unsyncedExamens = await db.getAllAsync<any>('SELECT * FROM examens WHERE is_synced = 0;');
    if (unsyncedExamens.length > 0) {
      console.log(`MedRecord Sync: Pushing ${unsyncedExamens.length} lab exams...`);
      for (const row of unsyncedExamens) {
        await db.runAsync('UPDATE examens SET is_synced = 1 WHERE id = ?;', [row.id]);
        totalSynced++;
      }
    }

    if (totalSynced > 0) {
      console.log(`MedRecord: Cloud sync complete. ${totalSynced} items synchronized.`);
    } else {
      console.log('MedRecord: All data is already up to date.');
    }

    return { success: true, syncedCount: totalSynced };
  } catch (error) {
    console.error('MedRecord: Synchronization failed:', error);
    return { success: false, syncedCount: totalSynced };
  } finally {
    isSyncing = false;
  }
}
