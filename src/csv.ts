const COLUMNS: Array<[string, string]> = [
  ['household_id', 'Household ID'],
  ['primary_contact_name', 'Primary Contact'],
  ['address_line1', 'Address Line 1'],
  ['address_line2', 'Address Line 2'],
  ['city', 'City'],
  ['state_region', 'State/Region'],
  ['postal_code', 'Postal Code'],
  ['phone', 'Phone'],
  ['email', 'Email'],
  ['person_name', 'Person Name'],
  ['attendance', 'Attendance'],
  ['willing_to_help', 'Willing to Help'],
  ['help_details', 'Help Details'],
  ['willing_to_bring', 'Willing to Bring'],
  ['bring_details', 'Bring Details'],
  ['comments', 'Comments'],
  ['created_at', 'Created At'],
  ['updated_at', 'Updated At'],
];

function protectSpreadsheetFormula(value: string): string {
  return /^[\s]*[=+\-@]/.test(value) ? `'${value}` : value;
}

export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? '' : String(value);
  if (value === 0 || value === 1) text = value === 1 ? 'Yes' : 'No';
  text = protectSpreadsheetFormula(text);
  return `"${text.replace(/"/g, '""')}"`;
}

export function renderCsv(rows: Array<Record<string, unknown>>): string {
  const lines = [COLUMNS.map(([, label]) => csvCell(label)).join(',')];
  for (const row of rows) lines.push(COLUMNS.map(([key]) => csvCell(row[key])).join(','));
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}
