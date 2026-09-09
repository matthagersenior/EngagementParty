import { collectPayload, fillForm, requestJson, setupForm, showErrors } from './form.js';

const statsRoot = document.querySelector('[data-stats]');
const listRoot = document.querySelector('[data-households]');
const searchForm = document.querySelector('[data-search-form]');
const status = document.querySelector('[data-admin-status]');
const dialog = document.querySelector('[data-edit-dialog]');
const editForm = dialog.querySelector('[data-rsvp-form]');
const editError = dialog.querySelector('[data-form-error]');
let editingId = null;

setupForm(editForm);

function text(tag, value, className = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = value ?? '';
  return node;
}

function attendanceLabel(value) {
  if (value === 'attending') return 'Attending';
  if (value === 'not_attending') return 'Not attending';
  return 'Unsure';
}

function renderStats(stats) {
  const cards = [
    ['Households', stats.households],
    ['People', stats.people],
    ['Attending', stats.attending],
    ['Not attending', stats.notAttending],
    ['Unsure', stats.unsure],
    ['Helping', stats.willingToHelp],
    ['Bringing something', stats.willingToBring],
  ];
  statsRoot.replaceChildren(...cards.map(([label, value]) => {
    const card = document.createElement('article');
    card.className = 'stat-card';
    card.append(text('strong', String(value)), text('span', label));
    return card;
  }));
}

function contactLine(h) {
  return [h.addressLine1, h.addressLine2, `${h.city}, ${h.stateRegion} ${h.postalCode}`].filter(Boolean).join(' · ');
}

function renderHouseholds(households) {
  listRoot.replaceChildren();
  if (!households.length) {
    listRoot.append(text('p', 'No responses match these filters.', 'empty-state'));
    return;
  }
  for (const h of households) {
    const details = document.createElement('details');
    details.className = 'household-card';
    const summary = document.createElement('summary');
    const title = document.createElement('div');
    title.append(text('strong', h.primaryContactName), text('span', `${h.people.length} ${h.people.length === 1 ? 'person' : 'people'}`));
    const badges = document.createElement('div');
    badges.className = 'badge-row';
    if (h.willingToHelp) badges.append(text('span', 'Helping', 'badge'));
    if (h.willingToBring) badges.append(text('span', 'Bringing item', 'badge'));
    summary.append(title, badges);
    details.append(summary);

    const body = document.createElement('div');
    body.className = 'household-body';
    body.append(
      text('p', `${h.email} · ${h.phone}`),
      text('p', contactLine(h)),
    );
    const people = document.createElement('ul');
    people.className = 'people-summary';
    for (const person of h.people) {
      const item = document.createElement('li');
      item.append(text('span', person.fullName), text('span', attendanceLabel(person.attendance), `attendance ${person.attendance}`));
      people.append(item);
    }
    body.append(people);
    if (h.willingToHelp) body.append(text('p', `Help: ${h.helpDetails || ''}`));
    if (h.willingToBring) body.append(text('p', `Bring: ${h.bringDetails || ''}`));
    if (h.comments) body.append(text('p', `Comments: ${h.comments}`));
    body.append(text('p', `Last updated: ${new Date(h.updatedAt).toLocaleString()}`, 'muted'));
    const edit = text('button', 'Edit response', 'button button-secondary');
    edit.type = 'button';
    edit.addEventListener('click', () => openEditor(h));
    body.append(edit);
    details.append(body);
    listRoot.append(details);
  }
}

async function loadStats() {
  const stats = await requestJson('/api/admin/stats');
  renderStats(stats);
}

async function loadList() {
  status.textContent = 'Loading responses…';
  const data = new FormData(searchForm);
  const params = new URLSearchParams();
  if (data.get('q')) params.set('q', data.get('q'));
  if (data.get('attendance')) params.set('attendance', data.get('attendance'));
  if (data.get('help')) params.set('help', 'true');
  if (data.get('bring')) params.set('bring', 'true');
  try {
    const body = await requestJson(`/api/admin/rsvps?${params}`);
    renderHouseholds(body.households);
    status.textContent = `${body.households.length} response${body.households.length === 1 ? '' : 's'} shown.`;
  } catch (error) {
    status.textContent = error.message || 'Could not load responses.';
  }
}

function openEditor(household) {
  editingId = household.id;
  fillForm(editForm, household);
  editError.hidden = true;
  dialog.showModal();
}

dialog.querySelector('[data-close-dialog]').addEventListener('click', () => dialog.close());

editForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  editError.hidden = true;
  const button = editForm.querySelector('[type="submit"]');
  button.disabled = true;
  try {
    await requestJson(`/api/admin/rsvps/${editingId}`, {
      method: 'PUT',
      body: JSON.stringify(collectPayload(editForm)),
    });
    dialog.close();
    await Promise.all([loadStats(), loadList()]);
  } catch (error) {
    showErrors(editForm, error.fieldErrors);
    editError.textContent = error.message || 'Could not save changes.';
    editError.hidden = false;
  } finally {
    button.disabled = false;
  }
});

searchForm.addEventListener('submit', (event) => {
  event.preventDefault();
  loadList();
});
searchForm.addEventListener('change', loadList);

await Promise.all([loadStats(), loadList()]);
