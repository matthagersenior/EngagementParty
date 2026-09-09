import { collectPayload, requestJson, setupForm, showErrors } from './form.js';

const STORAGE_KEY = 'engagementPartyEditToken';
const form = document.querySelector('[data-rsvp-form]');
const submitButton = form.querySelector('[type="submit"]');
const formError = document.querySelector('[data-form-error]');
const success = document.querySelector('[data-success]');
const editOffer = document.querySelector('[data-edit-offer]');
const updateLink = document.querySelector('[data-update-link]');
const anotherButton = document.querySelector('[data-another-household]');

setupForm(form);

const existingToken = localStorage.getItem(STORAGE_KEY);
if (existingToken) {
  editOffer.hidden = false;
  updateLink.href = `/edit#token=${encodeURIComponent(existingToken)}`;
}
anotherButton?.addEventListener('click', () => {
  editOffer.hidden = true;
  form.querySelector('input')?.focus();
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  formError.hidden = true;
  submitButton.disabled = true;
  submitButton.textContent = 'Submitting…';
  try {
    const body = await requestJson('/api/rsvps', {
      method: 'POST',
      body: JSON.stringify(collectPayload(form)),
    });
    const token = new URL(body.editUrl, location.origin).hash.replace(/^#token=/, '');
    const decodedToken = decodeURIComponent(token);
    localStorage.setItem(STORAGE_KEY, decodedToken);
    const privateLink = `${location.origin}/edit#token=${encodeURIComponent(decodedToken)}`;
    document.querySelector('[data-private-link]').value = privateLink;
    form.hidden = true;
    editOffer.hidden = true;
    success.hidden = false;
    success.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    showErrors(form, error.fieldErrors);
    formError.textContent = error.message || 'We could not save your RSVP. Please try again.';
    formError.hidden = false;
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = 'Submit RSVP';
  }
});

document.querySelector('[data-copy-link]').addEventListener('click', async () => {
  const field = document.querySelector('[data-private-link]');
  try {
    await navigator.clipboard.writeText(field.value);
    document.querySelector('[data-copy-status]').textContent = 'Private edit link copied.';
  } catch {
    field.select();
    document.querySelector('[data-copy-status]').textContent = 'Select and copy the link above.';
  }
});
