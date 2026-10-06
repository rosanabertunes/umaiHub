/**
 * Validador e formatador oficial de CPF Brasileiro
 */

export function cleanCPF(cpf: string): string {
  return (cpf || '').replace(/\D/g, '');
}

export function formatCPF(value: string): string {
  const digits = cleanCPF(value).slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
}

/**
 * Valida os 11 dígitos do CPF através do algoritmo módulo 11.
 * Retorna true se for válido.
 * Se o campo for vazio ou nulo, retorna true (pois é opcional).
 */
export function isValidCPF(cpf: string | null | undefined): boolean {
  if (!cpf) return true;
  const clean = cleanCPF(cpf);
  if (clean.length === 0) return true;
  if (clean.length !== 11) return false;

  // Rejeita sequências repetidas conhecidas (00000000000, 11111111111, etc.)
  if (/^(\d)\1{10}$/.test(clean)) return false;

  // Primeiro dígito verificador
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(clean.charAt(i), 10) * (10 - i);
  }
  let remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(clean.charAt(9), 10)) return false;

  // Segundo dígito verificador
  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(clean.charAt(i), 10) * (11 - i);
  }
  remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(clean.charAt(10), 10)) return false;

  return true;
}
