/**
 * Normalizes a phone number to a WhatsApp-sendable digit string with a country code.
 * Not every prospect types their country code — most who don't are a local, 10-digit
 * Indian mobile number (this platform's near-exclusive market: INR pricing, every phone
 * placeholder across the app already shows "+91"). A bare 10-digit number gets "91"
 * prepended automatically; anything that already looks like it has a country code (a
 * leading "+", or more than 10 digits) is left alone.
 */
export function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  const hadPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (hadPlus || digits.length > 10) return digits;
  if (digits.length === 10) return `91${digits}`;
  return digits;
}
