import type { Attendance, GuestInput, RsvpInput } from './types';

const LIMITS = {
  primaryContactName: 120,
  personName: 120,
  addressLine1: 160,
  addressLine2: 160,
  city: 100,
  stateRegion: 100,
  postalCode: 32,
  phone: 40,
  email: 254,
  helpDetails: 1000,
  bringDetails: 1000,
  comments: 2000,
} as const;

const ATTENDANCE = new Set<Attendance>(['attending', 'not_attending', 'unsure']);

export class ValidationError extends Error {
  readonly fieldErrors: Record<string, string>;

  constructor(fieldErrors: Record<string, string>) {
    super('Validation failed');
    this.name = 'ValidationError';
    this.fieldErrors = fieldErrors;
  }
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(
  source: Record<string, unknown>,
  key: string,
  max: number,
  errors: Record<string, string>,
  required: boolean,
): string | null {
  const raw = source[key];
  if (raw === null || raw === undefined) {
    if (required) errors[key] = 'This field is required.';
    return null;
  }
  if (typeof raw !== 'string') {
    errors[key] = 'Must be text.';
    return null;
  }
  const trimmed = raw.trim();
  if (required && !trimmed) errors[key] = 'This field is required.';
  if (trimmed.length > max) errors[key] = `Must be ${max} characters or fewer.`;
  return trimmed || null;
}

function booleanValue(source: Record<string, unknown>, key: string, errors: Record<string, string>): boolean {
  const value = source[key];
  if (typeof value !== 'boolean') {
    errors[key] = 'Choose yes or no.';
    return false;
  }
  return value;
}

function validEmail(email: string): boolean {
  const at = email.indexOf('@');
  if (at <= 0 || at !== email.lastIndexOf('@')) return false;
  const domain = email.slice(at + 1);
  return domain.includes('.') && !domain.startsWith('.') && !domain.endsWith('.');
}

export function validateRsvpInput(value: unknown): RsvpInput {
  const source = objectValue(value);
  if (!source) throw new ValidationError({ form: 'Request body must be a JSON object.' });

  const errors: Record<string, string> = {};
  const primaryContactName = text(source, 'primaryContactName', LIMITS.primaryContactName, errors, true);
  const addressLine1 = text(source, 'addressLine1', LIMITS.addressLine1, errors, true);
  const addressLine2 = text(source, 'addressLine2', LIMITS.addressLine2, errors, false);
  const city = text(source, 'city', LIMITS.city, errors, true);
  const stateRegion = text(source, 'stateRegion', LIMITS.stateRegion, errors, true);
  const postalCode = text(source, 'postalCode', LIMITS.postalCode, errors, true);
  const phone = text(source, 'phone', LIMITS.phone, errors, true);
  const email = text(source, 'email', LIMITS.email, errors, true);
  const willingToHelp = booleanValue(source, 'willingToHelp', errors);
  let helpDetails = text(source, 'helpDetails', LIMITS.helpDetails, errors, false);
  const willingToBring = booleanValue(source, 'willingToBring', errors);
  let bringDetails = text(source, 'bringDetails', LIMITS.bringDetails, errors, false);
  const comments = text(source, 'comments', LIMITS.comments, errors, false);

  if (email && !validEmail(email)) errors.email = 'Enter a valid email address.';
  if (willingToHelp && !helpDetails) errors.helpDetails = 'Tell us how you would like to help.';
  if (!willingToHelp) helpDetails = null;
  if (willingToBring && !bringDetails) errors.bringDetails = 'Tell us what you would be willing to bring.';
  if (!willingToBring) bringDetails = null;

  const peopleRaw = source.people;
  const people: GuestInput[] = [];
  if (!Array.isArray(peopleRaw)) {
    errors.people = 'Add at least one person.';
  } else {
    if (peopleRaw.length < 1) errors.people = 'Add at least one person.';
    if (peopleRaw.length > 50) errors.people = 'A group can contain no more than 50 people.';
    for (let index = 0; index < Math.min(peopleRaw.length, 50); index += 1) {
      const person = objectValue(peopleRaw[index]);
      if (!person) {
        errors[`people.${index}`] = 'Person entry is invalid.';
        continue;
      }
      const rawName = person.fullName;
      let name: string | null = null;
      if (typeof rawName !== 'string') {
        errors[`people.${index}.fullName`] = 'Name is required.';
      } else {
        name = rawName.trim();
        if (!name) errors[`people.${index}.fullName`] = 'Name is required.';
        else if (name.length > LIMITS.personName) errors[`people.${index}.fullName`] = `Must be ${LIMITS.personName} characters or fewer.`;
      }
      const attendance = person.attendance;
      if (typeof attendance !== 'string' || !ATTENDANCE.has(attendance as Attendance)) {
        errors[`people.${index}.attendance`] = 'Choose attending, not attending, or unsure.';
      }
      if (name && typeof attendance === 'string' && ATTENDANCE.has(attendance as Attendance)) {
        people.push({ fullName: name, attendance: attendance as Attendance });
      }
    }
  }

  if (Object.keys(errors).length > 0) throw new ValidationError(errors);

  return {
    primaryContactName: primaryContactName!,
    addressLine1: addressLine1!,
    addressLine2,
    city: city!,
    stateRegion: stateRegion!,
    postalCode: postalCode!,
    phone: phone!,
    email: email!,
    willingToHelp,
    helpDetails,
    willingToBring,
    bringDetails,
    comments,
    people,
  };
}

export { LIMITS };
