import { collectPayload, fillForm, requestJson, setupForm, showErrors } from './form.js';

const STORAGE_KEY = 'engagementPartyEditToken';
const form = document.querySelector('[data-rsvp-form]');
const loading = document.querySelector('[data-loading]');
const pageError = document.querySelector('[data-page-error]');
const formError = document.querySelector('[data-form-error]');
const success = document.querySelector('[data-success]');
const submitButton = form.querySelector('[type="submit"]');

setupForm(form);

const params = new URLSearchParams(location.hash.slice(1));
const token = params.get('token') || localStorage.getItem(STORAGE_KEY);

async function load() {
  if (!token) {
    loading.hidden = true;
    pageError.hidden = false;
    return;
  }
  try {
    const body = await requestJson('/api/rsvps/edit', {
      headers: { Authorization: `Bearer ${token}` },
    });
    localStorage.setItem(STORAGE_KEY, token);
    fillForm(form, body.household);
    loading.hidden = true;
    form.hidden = false;
  } catch {
    loading.hidden = true;
    pageError.hidden = false;
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  formError.hidden = true;
  submitButton.disabled = true;
  submitButton.textContent = 'Saving…';
  try {
    const body = await requestJson('/api/rsvps/edit', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(collectPayload(form)),
    });
    fillForm(form, body.household);
    success.hidden = false;
    success.textContent = 'Your RSVP has been updated.';
    success.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    if (error.status === 404) {
      form.hidden = true;
      pageError.hidden = false;
      return;
    }
    showErrors(form, error.fieldErrors);
    formError.textContent = error.message || 'We could not update your RSVP. Please try again.';
    formError.hidden = false;
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = 'Save changes';
  }
});

load();
