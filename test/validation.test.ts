import { describe, expect, it } from 'vitest';
import { LIMITS, ValidationError, validateRsvpInput } from '../src/validation';

const valid = {
  primaryContactName: 'Alex Morgan',
  addressLine1: '123 Main St',
  addressLine2: '',
  city: 'St. Louis',
  stateRegion: 'MO',
  postalCode: '63101',
  phone: '314-555-0100',
  email: 'alex@example.com',
  willingToHelp: true,
  helpDetails: 'Decorations',
  willingToBring: false,
  bringDetails: '',
  comments: '',
  people: [
    { fullName: 'Alex Morgan', attendance: 'attending' },
    { fullName: 'Jordan Morgan', attendance: 'unsure' },
  ],
};

describe('validateRsvpInput', () => {
  it('normalizes valid multi-person input and preserves per-person attendance', () => {
    const result = validateRsvpInput(valid);
    expect(result.people.map((p) => p.attendance)).toEqual(['attending', 'unsure']);
    expect(result.addressLine2).toBeNull();
    expect(result.bringDetails).toBeNull();
  });

  it('requires between one and fifty people', () => {
    expect(() => validateRsvpInput({ ...valid, people: [] })).toThrow(ValidationError);
    expect(() => validateRsvpInput({ ...valid, people: Array.from({ length: 51 }, (_, i) => ({ fullName: `Person ${i}`, attendance: 'attending' })) })).toThrow(ValidationError);
  });

  it('rejects invalid attendance values', () => {
    expect(() => validateRsvpInput({ ...valid, people: [{ fullName: 'Alex', attendance: 'maybe' }] })).toThrow(ValidationError);
  });

  it('requires conditional help and bring details', () => {
    expect(() => validateRsvpInput({ ...valid, willingToHelp: true, helpDetails: '   ' })).toThrow(ValidationError);
    expect(() => validateRsvpInput({ ...valid, willingToBring: true, bringDetails: '' })).toThrow(ValidationError);
  });

  it('enforces every documented maximum length', () => {
    const cases: Array<[string, number]> = [
      ['primaryContactName', LIMITS.primaryContactName], ['addressLine1', LIMITS.addressLine1],
      ['addressLine2', LIMITS.addressLine2], ['city', LIMITS.city], ['stateRegion', LIMITS.stateRegion],
      ['postalCode', LIMITS.postalCode], ['phone', LIMITS.phone], ['email', LIMITS.email],
      ['helpDetails', LIMITS.helpDetails], ['bringDetails', LIMITS.bringDetails], ['comments', LIMITS.comments],
    ];
    for (const [field, limit] of cases) {
      const value = { ...valid, [field]: 'x'.repeat(limit + 1) };
      if (field === 'email') value.email = `${'x'.repeat(limit)}@a.com`;
      expect(() => validateRsvpInput(value), field).toThrow(ValidationError);
    }
    expect(() => validateRsvpInput({ ...valid, people: [{ fullName: 'x'.repeat(LIMITS.personName + 1), attendance: 'attending' }] })).toThrow(ValidationError);
  });

  it('uses practical email validation', () => {
    for (const email of ['no-at-sign', '@example.com', 'a@localhost', 'a@@example.com']) {
      expect(() => validateRsvpInput({ ...valid, email }), email).toThrow(ValidationError);
    }
    expect(validateRsvpInput({ ...valid, email: 'a+b@example.co.uk' }).email).toBe('a+b@example.co.uk');
  });
});
