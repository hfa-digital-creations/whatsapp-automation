export interface ExportContact {
  name: string;
  phone: string | null;
  email?: string | null;
}

export function buildVcf(contacts: ExportContact[]): string {
  return contacts
    .map((c) => {
      const lines = ['BEGIN:VCARD', 'VERSION:3.0', `FN:${escapeVcfValue(c.name)}`];
      if (c.phone) lines.push(`TEL;TYPE=CELL:${c.phone}`);
      if (c.email) lines.push(`EMAIL:${escapeVcfValue(c.email)}`);
      lines.push('END:VCARD');
      return lines.join('\r\n');
    })
    .join('\r\n');
}

function escapeVcfValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n');
}

export function buildCsv(contacts: ExportContact[]): string {
  const header = 'Name,Phone,Email';
  const rows = contacts.map((c) => [c.name, c.phone ?? '', c.email ?? ''].map(csvEscape).join(','));
  return [header, ...rows].join('\r\n');
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}
