import { getDatabase, generateUUID, generatePatientFolderNumber, writeAuditLog } from './db';
import { encryptData, decryptData } from '../security/encryption';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface Patient {
  id: string;
  numero_dossier: string;
  nom: string;
  prenom: string;
  sexe: 'M' | 'F';
  date_naissance: string;
  telephone: string | null;
  adresse: string | null;
  profession: string | null;
  personne_prevenir: string | null;
  groupe_sanguin: string | null;
  photo_url: string | null;
  created_at: string;
  updated_at: string;
  is_synced: boolean;
}

export interface Antecedent {
  id: string;
  patient_id: string;
  type: 'MEDICAL' | 'CHIRURGICAL' | 'TRAUMATIQUE' | 'OBSTETRICAL' | 'FAMILIAL' | 'ALLERGIE' | 'TRAITEMENT_CHRONIQUE';
  description: string;
  created_at: string;
  updated_at: string;
  is_synced: boolean;
}

export interface Consultation {
  id: string;
  patient_id: string;
  medecin_id: string;
  date: string;
  motif: string;
  histoire_maladie: string | null;
  examen_clinique: string | null;
  diagnostic: string | null;
  traitement: string | null;
  conseils: string | null;
  date_controle: string | null;
  created_at: string;
  updated_at: string;
  is_synced: boolean;
  constantes?: Constante | null;
}

export interface Constante {
  id: string;
  consultation_id: string;
  temperature: number | null;
  tension_arterielle: string | null;
  frequence_cardiaque: number | null;
  saturation: number | null;
  glycemie: number | null;
  poids: number | null;
  taille: number | null;
  imc: number | null;
  created_at: string;
  updated_at: string;
  is_synced: boolean;
}

export interface Ordonnance {
  id: string;
  consultation_id: string;
  contenu: string;
  date: string;
  pdf_url: string | null;
  created_at: string;
  updated_at: string;
  is_synced: boolean;
}

export interface Certificat {
  id: string;
  patient_id: string;
  type: 'MEDICAL' | 'ACCIDENT_TRAVAIL' | 'APTITUDE' | 'INAPTITUDE' | 'ARRET_TRAVAIL';
  description: string;
  date_debut: string;
  date_fin: string | null;
  pdf_url: string | null;
  created_at: string;
  updated_at: string;
  is_synced: boolean;
}

export interface Vaccination {
  id: string;
  patient_id: string;
  vaccin: string;
  date_administration: string;
  date_rappel: string | null;
  created_at: string;
  updated_at: string;
  is_synced: boolean;
}

export interface RendezVous {
  id: string;
  patient_id: string;
  medecin_id: string;
  date_heure: string;
  statut: 'PROGRAMME' | 'CONFIRME' | 'ANNULE' | 'REALISE';
  created_at: string;
  updated_at: string;
  is_synced: boolean;
  // Joins
  patient_nom?: string;
  patient_prenom?: string;
  patient_telephone?: string | null;
  patient_numero_dossier?: string;
}

// ============================================================================
// PATIENTS OPERATIONS
// ============================================================================

export async function createPatient(
  patient: Omit<Patient, 'id' | 'numero_dossier' | 'created_at' | 'updated_at' | 'is_synced'>,
  userId: string
): Promise<Patient> {
  const db = await getDatabase();
  const id = generateUUID();
  const numero_dossier = await generatePatientFolderNumber();

  // Encrypt sensitive identity fields
  const encNom = (await encryptData(patient.nom))!;
  const encPrenom = (await encryptData(patient.prenom))!;
  const encTelephone = await encryptData(patient.telephone);
  const encAdresse = await encryptData(patient.adresse);
  const encProfession = await encryptData(patient.profession);
  const encPersonnePrevenir = await encryptData(patient.personne_prevenir);

  await db.runAsync(
    `INSERT INTO patients (
      id, numero_dossier, nom, prenom, sexe, date_naissance, 
      telephone, adresse, profession, personne_prevenir, 
      groupe_sanguin, photo_url, is_synced
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0);`,
    [
      id,
      numero_dossier,
      encNom,
      encPrenom,
      patient.sexe,
      patient.date_naissance,
      encTelephone,
      encAdresse,
      encProfession,
      encPersonnePrevenir,
      patient.groupe_sanguin,
      patient.photo_url,
    ]
  );

  await writeAuditLog(userId, 'CREATE', 'patients', id, `Création du patient ${numero_dossier}`);

  return {
    ...patient,
    id,
    numero_dossier,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    is_synced: false,
  };
}

export async function getPatients(): Promise<Patient[]> {
  const db = await getDatabase();
  const rows = (await db.getAllAsync('SELECT * FROM patients ORDER BY created_at DESC;')) as any[];
  const decryptedPatients: Patient[] = [];

  for (const row of rows) {
    decryptedPatients.push({
      id: row.id,
      numero_dossier: row.numero_dossier,
      nom: (await decryptData(row.nom)) || '',
      prenom: (await decryptData(row.prenom)) || '',
      sexe: row.sexe,
      date_naissance: row.date_naissance,
      telephone: await decryptData(row.telephone),
      adresse: await decryptData(row.adresse),
      profession: await decryptData(row.profession),
      personne_prevenir: await decryptData(row.personne_prevenir),
      groupe_sanguin: row.groupe_sanguin,
      photo_url: row.photo_url,
      created_at: row.created_at,
      updated_at: row.updated_at,
      is_synced: row.is_synced === 1,
    });
  }

  return decryptedPatients;
}

export async function getPatientById(id: string): Promise<Patient | null> {
  const db = await getDatabase();
  const row = (await db.getFirstAsync('SELECT * FROM patients WHERE id = ?;', [id])) as any;
  if (!row) return null;

  return {
    id: row.id,
    numero_dossier: row.numero_dossier,
    nom: (await decryptData(row.nom)) || '',
    prenom: (await decryptData(row.prenom)) || '',
    sexe: row.sexe,
    date_naissance: row.date_naissance,
    telephone: await decryptData(row.telephone),
    adresse: await decryptData(row.adresse),
    profession: await decryptData(row.profession),
    personne_prevenir: await decryptData(row.personne_prevenir),
    groupe_sanguin: row.groupe_sanguin,
    photo_url: row.photo_url,
    created_at: row.created_at,
    updated_at: row.updated_at,
    is_synced: row.is_synced === 1,
  };
}

export async function updatePatient(
  id: string,
  updates: Partial<Omit<Patient, 'id' | 'numero_dossier' | 'created_at' | 'updated_at' | 'is_synced'>>,
  userId: string
): Promise<void> {
  const db = await getDatabase();
  const fields: string[] = [];
  const params: any[] = [];

  if (updates.nom !== undefined) {
    fields.push('nom = ?');
    params.push(await encryptData(updates.nom));
  }
  if (updates.prenom !== undefined) {
    fields.push('prenom = ?');
    params.push(await encryptData(updates.prenom));
  }
  if (updates.sexe !== undefined) {
    fields.push('sexe = ?');
    params.push(updates.sexe);
  }
  if (updates.date_naissance !== undefined) {
    fields.push('date_naissance = ?');
    params.push(updates.date_naissance);
  }
  if (updates.telephone !== undefined) {
    fields.push('telephone = ?');
    params.push(await encryptData(updates.telephone));
  }
  if (updates.adresse !== undefined) {
    fields.push('adresse = ?');
    params.push(await encryptData(updates.adresse));
  }
  if (updates.profession !== undefined) {
    fields.push('profession = ?');
    params.push(await encryptData(updates.profession));
  }
  if (updates.personne_prevenir !== undefined) {
    fields.push('personne_prevenir = ?');
    params.push(await encryptData(updates.personne_prevenir));
  }
  if (updates.groupe_sanguin !== undefined) {
    fields.push('groupe_sanguin = ?');
    params.push(updates.groupe_sanguin);
  }
  if (updates.photo_url !== undefined) {
    fields.push('photo_url = ?');
    params.push(updates.photo_url);
  }

  if (fields.length === 0) return;

  fields.push('is_synced = 0');
  fields.push("updated_at = datetime('now')");
  params.push(id); // for WHERE clause

  const query = `UPDATE patients SET ${fields.join(', ')} WHERE id = ?;`;
  await db.runAsync(query, params);

  await writeAuditLog(userId, 'UPDATE', 'patients', id, `Modification des coordonnées du patient`);
}

// ============================================================================
// ANTECEDENTS OPERATIONS
// ============================================================================

export async function addAntecedent(
  antecedent: Omit<Antecedent, 'id' | 'created_at' | 'updated_at' | 'is_synced'>,
  userId: string
): Promise<Antecedent> {
  const db = await getDatabase();
  const id = generateUUID();

  // Encrypt the sensitive description field
  const encDescription = (await encryptData(antecedent.description))!;

  await db.runAsync(
    `INSERT INTO antecedents (id, patient_id, type, description, is_synced) 
     VALUES (?, ?, ?, ?, 0);`,
    [id, antecedent.patient_id, antecedent.type, encDescription]
  );

  await writeAuditLog(userId, 'CREATE', 'antecedents', id, `Ajout d'un antécédent de type ${antecedent.type}`);

  return {
    ...antecedent,
    id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    is_synced: false,
  };
}

export async function getAntecedentsByPatient(patientId: string): Promise<Antecedent[]> {
  const db = await getDatabase();
  const rows = (await db.getAllAsync(
    'SELECT * FROM antecedents WHERE patient_id = ? ORDER BY created_at DESC;',
    [patientId]
  )) as any[];
  const decryptedList: Antecedent[] = [];

  for (const row of rows) {
    decryptedList.push({
      id: row.id,
      patient_id: row.patient_id,
      type: row.type,
      description: (await decryptData(row.description)) || '',
      created_at: row.created_at,
      updated_at: row.updated_at,
      is_synced: row.is_synced === 1,
    });
  }

  return decryptedList;
}

// ============================================================================
// CONSULTATIONS & CONSTANTES OPERATIONS
// ============================================================================

export async function createConsultation(
  consultation: Omit<Consultation, 'id' | 'created_at' | 'updated_at' | 'is_synced'>,
  constantes: Omit<Constante, 'id' | 'consultation_id' | 'created_at' | 'updated_at' | 'is_synced' | 'imc'> | null,
  userId: string
): Promise<Consultation> {
  const db = await getDatabase();
  const consultationId = generateUUID();

  // Encrypt sensitive clinical fields
  const encMotif = (await encryptData(consultation.motif))!;
  const encHistoire = await encryptData(consultation.histoire_maladie);
  const encExamenClinique = await encryptData(consultation.examen_clinique);
  const encDiagnostic = await encryptData(consultation.diagnostic);
  const encTraitement = await encryptData(consultation.traitement);
  const encConseils = await encryptData(consultation.conseils);

  // Use a transaction to ensure both consultation and vitals are saved together
  await db.withTransactionAsync(async () => {
    // 1. Insert Consultation
    await db.runAsync(
      `INSERT INTO consultations (
        id, patient_id, medecin_id, date, motif, histoire_maladie, 
        examen_clinique, diagnostic, traitement, conseils, date_controle, is_synced
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0);`,
      [
        consultationId,
        consultation.patient_id,
        consultation.medecin_id,
        consultation.date,
        encMotif,
        encHistoire,
        encExamenClinique,
        encDiagnostic,
        encTraitement,
        encConseils,
        consultation.date_controle,
      ]
    );

    // 2. Insert Constantes if provided
    if (constantes) {
      const constanteId = generateUUID();
      let imc: number | null = null;
      if (constantes.poids && constantes.taille) {
        // height in cm, convert to meters
        imc = constantes.poids / Math.pow(constantes.taille / 100, 2);
        // Round to 2 decimal places
        imc = Math.round(imc * 100) / 100;
      }

      await db.runAsync(
        `INSERT INTO constantes (
          id, consultation_id, temperature, tension_arterielle, 
          frequence_cardiaque, saturation, glycemie, poids, taille, imc, is_synced
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0);`,
        [
          constanteId,
          consultationId,
          constantes.temperature,
          constantes.tension_arterielle,
          constantes.frequence_cardiaque,
          constantes.saturation,
          constantes.glycemie,
          constantes.poids,
          constantes.taille,
          imc,
        ]
      );
    }
  });

  await writeAuditLog(userId, 'CREATE', 'consultations', consultationId, `Nouvelle consultation médicale`);

  return {
    ...consultation,
    id: consultationId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    is_synced: false,
  };
}

export async function getConsultationsByPatient(patientId: string): Promise<Consultation[]> {
  const db = await getDatabase();
  const rows = (await db.getAllAsync(
    'SELECT * FROM consultations WHERE patient_id = ? ORDER BY date DESC;',
    [patientId]
  )) as any[];
  const result: Consultation[] = [];

  for (const row of rows) {
    // Get corresponding constants
    const constRow = (await db.getFirstAsync(
      'SELECT * FROM constantes WHERE consultation_id = ?;',
      [row.id]
    )) as any;

    const constantes: Constante | null = constRow
      ? {
          id: constRow.id,
          consultation_id: constRow.consultation_id,
          temperature: constRow.temperature,
          tension_arterielle: constRow.tension_arterielle,
          frequence_cardiaque: constRow.frequence_cardiaque,
          saturation: constRow.saturation,
          glycemie: constRow.glycemie,
          poids: constRow.poids,
          taille: constRow.taille,
          imc: constRow.imc,
          created_at: constRow.created_at,
          updated_at: constRow.updated_at,
          is_synced: constRow.is_synced === 1,
        }
      : null;

    result.push({
      id: row.id,
      patient_id: row.patient_id,
      medecin_id: row.medecin_id,
      date: row.date,
      motif: (await decryptData(row.motif)) || '',
      histoire_maladie: await decryptData(row.histoire_maladie),
      examen_clinique: await decryptData(row.examen_clinique),
      diagnostic: await decryptData(row.diagnostic),
      traitement: await decryptData(row.traitement),
      conseils: await decryptData(row.conseils),
      date_controle: row.date_controle,
      created_at: row.created_at,
      updated_at: row.updated_at,
      is_synced: row.is_synced === 1,
      constantes,
    });
  }

  return result;
}

// ============================================================================
// ORDONNANCES OPERATIONS
// ============================================================================

export async function addOrdonnance(
  ordonnance: Omit<Ordonnance, 'id' | 'created_at' | 'updated_at' | 'is_synced'>,
  userId: string
): Promise<Ordonnance> {
  const db = await getDatabase();
  const id = generateUUID();

  // Encrypt sensitive prescription contents
  const encContenu = (await encryptData(ordonnance.contenu))!;

  await db.runAsync(
    `INSERT INTO ordonnances (id, consultation_id, contenu, date, pdf_url, is_synced) 
     VALUES (?, ?, ?, ?, ?, 0);`,
    [id, ordonnance.consultation_id, encContenu, ordonnance.date, ordonnance.pdf_url]
  );

  await writeAuditLog(userId, 'CREATE', 'ordonnances', id, `Rédaction d'une ordonnance`);

  return {
    ...ordonnance,
    id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    is_synced: false,
  };
}

export async function getOrdonnanceByConsultation(consultationId: string): Promise<Ordonnance | null> {
  const db = await getDatabase();
  const row = (await db.getFirstAsync(
    'SELECT * FROM ordonnances WHERE consultation_id = ?;',
    [consultationId]
  )) as any;
  if (!row) return null;

  return {
    id: row.id,
    consultation_id: row.consultation_id,
    contenu: (await decryptData(row.contenu)) || '',
    date: row.date,
    pdf_url: row.pdf_url,
    created_at: row.created_at,
    updated_at: row.updated_at,
    is_synced: row.is_synced === 1,
  };
}

// ============================================================================
// CERTIFICATS OPERATIONS
// ============================================================================

export async function addCertificat(
  certificat: Omit<Certificat, 'id' | 'created_at' | 'updated_at' | 'is_synced'>,
  userId: string
): Promise<Certificat> {
  const db = await getDatabase();
  const id = generateUUID();

  // Encrypt description
  const encDescription = (await encryptData(certificat.description))!;

  await db.runAsync(
    `INSERT INTO certificats (id, patient_id, type, description, date_debut, date_fin, pdf_url, is_synced) 
     VALUES (?, ?, ?, ?, ?, ?, ?, 0);`,
    [
      id,
      certificat.patient_id,
      certificat.type,
      encDescription,
      certificat.date_debut,
      certificat.date_fin,
      certificat.pdf_url,
    ]
  );

  await writeAuditLog(userId, 'CREATE', 'certificats', id, `Génération d'un certificat d'aptitude / arrêt (${certificat.type})`);

  return {
    ...certificat,
    id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    is_synced: false,
  };
}

export async function getCertificatsByPatient(patientId: string): Promise<Certificat[]> {
  const db = await getDatabase();
  const rows = (await db.getAllAsync(
    'SELECT * FROM certificats WHERE patient_id = ? ORDER BY created_at DESC;',
    [patientId]
  )) as any[];
  const result: Certificat[] = [];

  for (const row of rows) {
    result.push({
      id: row.id,
      patient_id: row.patient_id,
      type: row.type,
      description: (await decryptData(row.description)) || '',
      date_debut: row.date_debut,
      date_fin: row.date_fin,
      pdf_url: row.pdf_url,
      created_at: row.created_at,
      updated_at: row.updated_at,
      is_synced: row.is_synced === 1,
    });
  }

  return result;
}

// ============================================================================
// VACCINATIONS OPERATIONS
// ============================================================================

export async function addVaccination(
  vaccination: Omit<Vaccination, 'id' | 'created_at' | 'updated_at' | 'is_synced'>,
  userId: string
): Promise<Vaccination> {
  const db = await getDatabase();
  const id = generateUUID();

  await db.runAsync(
    `INSERT INTO vaccinations (id, patient_id, vaccin, date_administration, date_rappel, is_synced) 
     VALUES (?, ?, ?, ?, ?, 0);`,
    [id, vaccination.patient_id, vaccination.vaccin, vaccination.date_administration, vaccination.date_rappel]
  );

  await writeAuditLog(userId, 'CREATE', 'vaccinations', id, `Saisie du vaccin ${vaccination.vaccin}`);

  return {
    ...vaccination,
    id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    is_synced: false,
  };
}

export async function getVaccinationsByPatient(patientId: string): Promise<Vaccination[]> {
  const db = await getDatabase();
  const rows = (await db.getAllAsync(
    'SELECT * FROM vaccinations WHERE patient_id = ? ORDER BY date_administration DESC;',
    [patientId]
  )) as any[];

  return rows.map((row) => ({
    id: row.id,
    patient_id: row.patient_id,
    vaccin: row.vaccin,
    date_administration: row.date_administration,
    date_rappel: row.date_rappel,
    created_at: row.created_at,
    updated_at: row.updated_at,
    is_synced: row.is_synced === 1,
  }));
}

// ============================================================================
// RENDEZ-VOUS OPERATIONS
// ============================================================================

export async function addRendezVous(
  rdv: Omit<RendezVous, 'id' | 'created_at' | 'updated_at' | 'is_synced'>,
  userId: string
): Promise<RendezVous> {
  const db = await getDatabase();
  const id = generateUUID();

  await db.runAsync(
    `INSERT INTO rendez_vous (id, patient_id, medecin_id, date_heure, statut, is_synced) 
     VALUES (?, ?, ?, ?, ?, 0);`,
    [id, rdv.patient_id, rdv.medecin_id, rdv.date_heure, rdv.statut]
  );

  await writeAuditLog(userId, 'CREATE', 'rendez_vous', id, `Planification d'un rendez-vous`);

  return {
    ...rdv,
    id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    is_synced: false,
  };
}

export async function getRendezVous(medecinId: string): Promise<RendezVous[]> {
  const db = await getDatabase();
  // We join with patients to display their names and file number in the list
  const rows = (await db.getAllAsync(
    `SELECT rv.*, p.nom as p_nom, p.prenom as p_prenom, p.telephone as p_telephone, p.numero_dossier as p_numero_dossier 
     FROM rendez_vous rv
     JOIN patients p ON rv.patient_id = p.id
     WHERE rv.medecin_id = ?
     ORDER BY rv.date_heure ASC;`,
    [medecinId]
  )) as any[];

  const decryptedRdv: RendezVous[] = [];
  for (const row of rows) {
    const patientNom = (await decryptData(row.p_nom)) || '';
    const patientPrenom = (await decryptData(row.p_prenom)) || '';
    const patientTelephone = await decryptData(row.p_telephone);

    decryptedRdv.push({
      id: row.id,
      patient_id: row.patient_id,
      medecin_id: row.medecin_id,
      date_heure: row.date_heure,
      statut: row.statut,
      created_at: row.created_at,
      updated_at: row.updated_at,
      is_synced: row.is_synced === 1,
      patient_nom: patientNom,
      patient_prenom: patientPrenom,
      patient_telephone: patientTelephone || null,
      patient_numero_dossier: row.p_numero_dossier || '',
    });
  }

  return decryptedRdv;
}

export async function updateRendezVousStatut(id: string, statut: RendezVous['statut'], userId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE rendez_vous SET statut = ?, is_synced = 0, updated_at = datetime('now') WHERE id = ?;`,
    [statut, id]
  );
  await writeAuditLog(userId, 'UPDATE', 'rendez_vous', id, `Mise à jour du statut du rendez-vous en ${statut}`);
}

export async function updateRendezVous(
  id: string,
  updates: { date_heure?: string; statut?: RendezVous['statut'] },
  userId: string
): Promise<void> {
  const db = await getDatabase();
  const fields: string[] = [];
  const params: any[] = [];

  if (updates.date_heure !== undefined) {
    fields.push('date_heure = ?');
    params.push(updates.date_heure);
  }
  if (updates.statut !== undefined) {
    fields.push('statut = ?');
    params.push(updates.statut);
  }

  if (fields.length === 0) return;

  fields.push('is_synced = 0');
  fields.push("updated_at = datetime('now')");
  params.push(id);

  await db.runAsync(
    `UPDATE rendez_vous SET ${fields.join(', ')} WHERE id = ?;`,
    params
  );

  await writeAuditLog(userId, 'UPDATE', 'rendez_vous', id, `Modification du rendez-vous`);
}

// ============================================================================
// EXAMENS COMPLEMENTAIRES OPERATIONS
// ============================================================================

export async function addExamen(
  examen: Omit<Examen, 'id' | 'created_at' | 'updated_at' | 'is_synced'>,
  userId: string
): Promise<Examen> {
  const db = await getDatabase();
  const id = generateUUID();

  await db.runAsync(
    `INSERT INTO examens (id, consultation_id, type, fichier_url, is_synced) 
     VALUES (?, ?, ?, ?, 0);`,
    [id, examen.consultation_id, examen.type, examen.fichier_url]
  );

  await writeAuditLog(userId, 'CREATE', 'examens', id, `Ajout d'un examen complémentaire (${examen.type})`);

  return {
    ...examen,
    id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    is_synced: false,
  };
}

export interface Examen {
  id: string;
  consultation_id: string;
  type: 'BIOLOGIE' | 'IMAGERIE' | 'ECG' | 'SCANNER' | 'IRM' | 'ECHOGRAPHIE' | 'RADIOGRAPHIE';
  fichier_url: string | null;
  created_at: string;
  updated_at: string;
  is_synced: boolean;
}

export async function getExamensByConsultation(consultationId: string): Promise<Examen[]> {
  const db = await getDatabase();
  const rows = (await db.getAllAsync(
    'SELECT * FROM examens WHERE consultation_id = ? ORDER BY created_at DESC;',
    [consultationId]
  )) as any[];

  return rows.map((row) => ({
    id: row.id,
    consultation_id: row.consultation_id,
    type: row.type,
    fichier_url: row.fichier_url,
    created_at: row.created_at,
    updated_at: row.updated_at,
    is_synced: row.is_synced === 1,
  }));
}
