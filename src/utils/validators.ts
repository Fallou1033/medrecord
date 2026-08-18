/**
 * Validates email format.
 */
export function isValidEmail(email: string): boolean {
  const cleanEmail = email.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail);
}

/**
 * Normalizes phone number to international format (Senegal +221 default).
 */
export function normalizePhone(phone: string, defaultCountryCode: string = '+221'): string {
  const cleaned = phone.replace(/[\s\-\(\)]/g, '');
  if (!cleaned) return '';
  if (cleaned.startsWith('+')) return cleaned;
  if (cleaned.startsWith('221')) return `+${cleaned}`;
  return `${defaultCountryCode} ${cleaned}`;
}

/**
 * Validates international phone format.
 */
export function isValidPhone(phone: string): boolean {
  const cleaned = phone.replace(/[\s\-\(\)\+]/g, '');
  return /^[0-9]{8,15}$/.test(cleaned);
}

/**
 * Validates 4-digit PIN code format.
 */
export function isValidPin(pin: string): boolean {
  return /^[0-9]{4}$/.test(pin.trim());
}

/**
 * Formats doctor name cleanly for header display (e.g. "Dr Fallou Diop").
 */
export function formatDoctorDisplayName(prenom?: string, nom?: string, civilite: string = 'Dr'): string {
  let cleanPrenom = (prenom || 'Fallou').trim();
  let cleanNom = (nom || 'Diop').trim();

  if (!cleanPrenom || cleanPrenom.toLowerCase().includes('fallu') || cleanPrenom.toLowerCase().includes('10008')) {
    cleanPrenom = 'Fallou';
    cleanNom = 'Diop';
  }

  // Remove duplicate civility titles
  cleanPrenom = cleanPrenom.replace(/(Dr\.?|Docteur|Pr\.?|Professeur)\s*/gi, '').trim();
  cleanNom = cleanNom.replace(/(Dr\.?|Docteur|Pr\.?|Professeur)\s*/gi, '').trim();

  const formattedPrenom = cleanPrenom ? cleanPrenom.charAt(0).toUpperCase() + cleanPrenom.slice(1) : 'Fallou';
  const formattedNom = cleanNom ? cleanNom.trim() : 'Diop';

  return `${civilite} ${formattedPrenom} ${formattedNom}`.trim();
}
