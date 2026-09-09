const ATTENDANCE_OPTIONS = [
  ['attending', 'Attending'],
  ['not_attending', 'Not attending'],
  ['unsure', 'Unsure'],
];

function el(tag, attrs = {}, text = '') {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class') node.className = value;
    else if (key.startsWith('data-')) node.setAttribute(key, value);
    else node[key] = value;
  }
  if (text) node.textContent = text;
  return node;
}

export function addPerson(form, person = { fullName: '', attendance: 'unsure' }) {
  const list = form.querySelector('[data-people-list]');
  const row = el('div', { class: 'person-row' });
  const fields = el('div', { class: 'person-fields' });
  const nameWrap = el('label', { class: 'field' });
  nameWrap.append(el('span', {}, 'Name'));
  const input = el('input', {
    type: 'text',
    value: person.fullName || '',
    maxLength: 120,
    autocomplete: 'name',
    required: true,
    'data-person-name': 'true',
  });
  nameWrap.append(input);

  const attendanceWrap = el('label', { class: 'field' });
  attendanceWrap.append(el('span', {}, 'Attendance'));
  const select = el('select', { required: true, 'data-person-attendance': 'true' });
  for (const [value, label] of ATTENDANCE_OPTIONS) {
    const option = el('option', { value }, label);
    if (value === person.attendance) option.selected = true;
    select.append(option);
  }
  attendanceWrap.append(select);
  fields.append(nameWrap, attendanceWrap);

  const remove = el('button', { type: 'button', class: 'button button-quiet remove-person' }, 'Remove');
  remove.addEventListener('click', () => {
    const rows = list.querySelectorAll('.person-row');
    if (rows.length <= 1) {
      input.focus();
      return;
    }
    row.remove();
  });
  row.append(fields, remove);
  list.append(row);
}

function radioBoolean(formData, name) {
  return formData.get(name) === 'yes';
}

export function collectPayload(form) {
  const data = new FormData(form);
  const people = [...form.querySelectorAll('.person-row')].map((row) => ({
    fullName: row.querySelector('[data-person-name]').value,
    attendance: row.querySelector('[data-person-attendance]').value,
  }));
  return {
    primaryContactName: data.get('primaryContactName') || '',
    addressLine1: data.get('addressLine1') || '',
    addressLine2: data.get('addressLine2') || '',
    city: data.get('city') || '',
    stateRegion: data.get('stateRegion') || '',
    postalCode: data.get('postalCode') || '',
    phone: data.get('phone') || '',
    email: data.get('email') || '',
    willingToHelp: radioBoolean(data, 'willingToHelp'),
    helpDetails: data.get('helpDetails') || '',
    willingToBring: radioBoolean(data, 'willingToBring'),
    bringDetails: data.get('bringDetails') || '',
    comments: data.get('comments') || '',
    people,
  };
}

function setRadio(form, name, value) {
  const yes = form.querySelector(`input[name="${name}"][value="yes"]`);
  const no = form.querySelector(`input[name="${name}"][value="no"]`);
  if (yes) yes.checked = Boolean(value);
  if (no) no.checked = !value;
}

export function fillForm(form, household) {
  const values = {
    primaryContactName: household.primaryContactName,
    addressLine1: household.addressLine1,
    addressLine2: household.addressLine2 || '',
    city: household.city,
    stateRegion: household.stateRegion,
    postalCode: household.postalCode,
    phone: household.phone,
    email: household.email,
    helpDetails: household.helpDetails || '',
    bringDetails: household.bringDetails || '',
    comments: household.comments || '',
  };
  for (const [name, value] of Object.entries(values)) {
    const field = form.elements.namedItem(name);
    if (field) field.value = value;
  }
  setRadio(form, 'willingToHelp', household.willingToHelp);
  setRadio(form, 'willingToBring', household.willingToBring);
  const list = form.querySelector('[data-people-list]');
  list.replaceChildren();
  for (const person of household.people || []) addPerson(form, person);
  if (!household.people?.length) addPerson(form);
  syncConditionalFields(form);
}

export function clearErrors(form) {
  form.querySelectorAll('[data-field-error]').forEach((node) => {
    node.textContent = '';
    node.hidden = true;
  });
  form.querySelectorAll('[aria-invalid="true"]').forEach((node) => node.removeAttribute('aria-invalid'));
}

export function showErrors(form, fieldErrors = {}) {
  clearErrors(form);
  for (const [key, message] of Object.entries(fieldErrors)) {
    const rootKey = key.startsWith('people.') ? 'people' : key;
    const error = form.querySelector(`[data-field-error="${CSS.escape(rootKey)}"]`);
    if (error) {
      error.textContent = message;
      error.hidden = false;
    }
    const field = form.elements.namedItem(rootKey);
    if (field instanceof HTMLElement) field.setAttribute('aria-invalid', 'true');
  }
}

export function syncConditionalFields(form) {
  const helpYes = form.querySelector('input[name="willingToHelp"][value="yes"]')?.checked;
  const bringYes = form.querySelector('input[name="willingToBring"][value="yes"]')?.checked;
  const helpBlock = form.querySelector('[data-help-details-block]');
  const bringBlock = form.querySelector('[data-bring-details-block]');
  helpBlock.hidden = !helpYes;
  bringBlock.hidden = !bringYes;
  form.elements.namedItem('helpDetails').required = Boolean(helpYes);
  form.elements.namedItem('bringDetails').required = Boolean(bringYes);
}

export function setupForm(form) {
  const list = form.querySelector('[data-people-list]');
  if (!list.children.length) addPerson(form);
  form.querySelector('[data-add-person]').addEventListener('click', () => addPerson(form));
  form.querySelectorAll('input[name="willingToHelp"], input[name="willingToBring"]').forEach((radio) => {
    radio.addEventListener('change', () => syncConditionalFields(form));
  });
  syncConditionalFields(form);
}

export async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
  });
  let body = {};
  try {
    body = await response.json();
  } catch {
    body = {};
  }
  if (!response.ok) {
    const error = new Error(body.error || 'Request failed');
    error.fieldErrors = body.fieldErrors || {};
    error.status = response.status;
    throw error;
  }
  return body;
}
