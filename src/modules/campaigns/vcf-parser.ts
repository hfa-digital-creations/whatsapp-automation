export interface ParsedVcfContact {
  name?: string;
  phone: string;
  /** False when the source TEL had no "+" and the digits are too short to plausibly include a
   * country code (e.g. a bare 10-digit local number, as most phones' Contacts apps store them).
   * WhatsApp requires the full international number, so these will silently fail to send until
   * corrected — callers should keep them out of anything sendable rather than importing them as-is. */
  hasCountryCode: boolean;
}

/**
 * Minimal vCard (2.1/3.0/4.0) parser — extracts just what a group member needs (name +
 * first phone number) from each BEGIN:VCARD...END:VCARD block. Not a full RFC 6350
 * implementation, but handles the common exports from Google/Apple/Outlook contacts,
 * including folded (continuation) lines.
 */
export function parseVcf(content: string): ParsedVcfContact[] {
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  // RFC 6350 line folding: a line starting with a space/tab continues the previous line.
  const unfolded = normalized.replace(/\n[ \t]/g, '');
  const blocks = unfolded.split(/BEGIN:VCARD/i).slice(1);

  const contacts: ParsedVcfContact[] = [];
  for (const block of blocks) {
    const lines = block
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    let name: string | undefined;
    let phone: string | undefined;
    let hasCountryCode = false;

    for (const line of lines) {
      if (/^END:VCARD/i.test(line)) break;
      const colonIndex = line.indexOf(':');
      if (colonIndex === -1) continue;

      const rawKey = line.slice(0, colonIndex);
      const value = line.slice(colonIndex + 1).trim();
      const key = rawKey.split(';')[0].toUpperCase();

      if (key === 'FN' && !name) {
        name = value;
      } else if (key === 'N' && !name) {
        // N:Family;Given;Additional;Prefix;Suffix
        const parts = value.split(';').map((p) => p.trim());
        const display = [parts[1], parts[0]].filter(Boolean).join(' ');
        if (display) name = display;
      } else if (key === 'TEL' && !phone) {
        const digits = value.replace(/[^\d+]/g, '').replace(/^\+/, '');
        if (digits) {
          phone = digits;
          // A bare 10-digit (or shorter) number with no "+" is almost always a local number
          // saved without its country code — every real country code + national number combo
          // runs longer than that.
          hasCountryCode = value.trim().startsWith('+') || digits.length > 10;
        }
      }
    }

    if (phone) contacts.push({ name, phone, hasCountryCode });
  }
  return contacts;
}
