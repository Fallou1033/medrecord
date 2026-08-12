export function calculateAge(birthDateStr?: string | null): number | null {
  if (!birthDateStr || !birthDateStr.trim()) return null;
  const today = new Date();
  const birthDate = new Date(birthDateStr);
  if (isNaN(birthDate.getTime())) return null;
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age >= 0 ? age : null;
}

/**
 * Calculates Body Mass Index (BMI / IMC).
 * weight in kg, height in cm.
 */
export function calculateIMC(weight: number | null | undefined, height: number | null | undefined): number | null {
  if (!weight || !height || height <= 0) return null;
  const heightInMeters = height / 100;
  const imc = weight / (heightInMeters * heightInMeters);
  return Math.round(imc * 100) / 100;
}

/**
 * Formats a Date object or ISO string to French format DD/MM/YYYY.
 */
export function formatDateFR(dateInput: Date | string | null | undefined): string {
  if (!dateInput) return '';
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(date.getTime())) return '';
  
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  
  return `${day}/${month}/${year}`;
}

/**
 * Removes duplicate 'Dr', 'Dr.', 'Docteur' prefixes from doctor names.
 */
export function cleanRawName(name?: string | null): string {
  if (!name) return '';
  return name.replace(/^(dr\.?|docteur)\s+/gi, '').trim();
}

/**
 * Formats a doctor's full name with a single 'Dr' prefix.
 */
export function formatDoctorName(rawName?: string | null): string {
  if (!rawName || !rawName.trim()) return 'Dr Mohamadou Bamba Diop';
  const cleaned = cleanRawName(rawName);
  return `Dr ${cleaned}`;
}

/**
 * Calculates inclusive day count for sick leave certificates.
 * Returns 0 if end date is prior to start date or invalid.
 */
export function calculateSickLeaveDays(startDateStr: string, endDateStr: string): number {
  if (!startDateStr || !endDateStr) return 0;
  const start = new Date(startDateStr);
  const end = new Date(endDateStr);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;

  const diffTime = end.getTime() - start.getTime();
  if (diffTime < 0) return 0; // End date before start date

  return Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1;
}

/**
 * Calculates pediatric Paracetamol dose based on weight.
 * Standard dosage: 15 mg/kg per dose.
 */
export function calculatePediatricDose(weightKg: number | string | null | undefined): { doseMg: number; mlSyrup: number } | null {
  if (weightKg === null || weightKg === undefined) return null;
  const w = typeof weightKg === 'string' ? parseFloat(weightKg.replace(',', '.')) : weightKg;
  if (isNaN(w) || w <= 0) return null;

  const doseMg = Math.round(w * 15);
  const mlSyrup = Math.round((doseMg / 24) * 10) / 10; // Standard 2.4% pediatric syrup formulation
  return { doseMg, mlSyrup };
}

/**
 * Sanitizes phone number for WhatsApp integration (Senegal default +221).
 */
export function sanitizePhoneNumber(phoneRaw?: string | null): string {
  if (!phoneRaw) return '';
  let clean = phoneRaw.trim().replace(/[^0-9+]/g, '');
  if (clean.startsWith('+')) clean = clean.substring(1);
  if (clean.startsWith('00')) clean = clean.substring(2);
  if (clean.length === 9 && /^(77|78|76|70|75|33)/.test(clean)) {
    clean = '221' + clean;
  }
  return clean;
}
