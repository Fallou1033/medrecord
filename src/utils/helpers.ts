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
