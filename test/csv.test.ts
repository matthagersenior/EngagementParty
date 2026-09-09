import { describe, expect, it } from 'vitest';
import { csvCell, renderCsv } from '../src/csv';

describe('CSV export', () => {
  it('quotes commas, quotes and line breaks', () => {
    expect(csvCell('a,"b"\nc')).toBe('"a,""b""\nc"');
  });

  it('neutralizes spreadsheet formulas supplied by guests', () => {
    expect(csvCell('=HYPERLINK("bad")')).toBe('"\'=HYPERLINK(""bad"")"');
  });

  it('exports one row per person without token columns', () => {
    const csv = renderCsv([
      { household_id: 'h1', primary_contact_name: 'A', person_name: 'One', attendance: 'attending' },
      { household_id: 'h1', primary_contact_name: 'A', person_name: 'Two', attendance: 'unsure' },
    ]);
    expect(csv).toContain('"Person Name"');
    expect(csv).toContain('"One"');
    expect(csv).toContain('"Two"');
    expect(csv).not.toContain('edit_token');
    expect(csv.split('\r\n').filter(Boolean)).toHaveLength(3);
  });
});
