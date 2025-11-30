/**
 * SCHULHELFER – Primarstufe Rittergasse Basel
 * Barrierefreie JavaScript-Interaktion
 */

(function() {
  'use strict';

  // === DOM Elements ===
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => document.querySelectorAll(selector);

  const elements = {
    loading: $('#loading'),
    errorMessage: $('#error-message'),
    errorText: $('#error-text'),
    successMessage: $('#success-message'),
    successText: $('#success-text'),
    statusMessage: $('#status-message'),
    eventsSection: $('#events-section'),
    eventsList: $('#events-list'),
    noEvents: $('#no-events'),
    registrationSection: $('#registration-section'),
    selectedEventName: $('#selected-event-name'),
    form: $('#registration-form'),
    eventIdInput: $('#event-id'),
    nameInput: $('#name'),
    emailInput: $('#email'),
    phoneInput: $('#phone'),
    submitBtn: $('#submit-btn')
  };

  // === State ===
  let events = [];
  let selectedEvent = null;

  // === Initialize ===
  document.addEventListener('DOMContentLoaded', init);

  function init() {
    if (!CONFIG.API_URL || CONFIG.API_URL === 'IHRE_GOOGLE_APPS_SCRIPT_URL_HIER') {
      showError('Das Tool ist noch nicht konfiguriert. Bitte setzen Sie die API_URL in der index.html.');
      return;
    }

    loadEvents();
    setupFormValidation();
    setupKeyboardNavigation();
  }

  // === Load Events ===
  async function loadEvents() {
    showLoading(true);
    hideError();
    
    try {
      const response = await fetch(`${CONFIG.API_URL}?action=getEvents`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });

      if (!response.ok) throw new Error(`HTTP Fehler: ${response.status}`);

      const data = await response.json();
      if (data.error) throw new Error(data.error);

      events = data.events || [];
      renderEvents();
      announce(`${events.length} ${events.length === 1 ? 'Anlass' : 'Anlässe'} verfügbar`);
      
    } catch (error) {
      console.error('Fehler:', error);
      showError('Die Anlässe konnten nicht geladen werden. Bitte später erneut versuchen.');
    } finally {
      showLoading(false);
    }
  }

  // === Render Events ===
  function renderEvents() {
    if (events.length === 0) {
      elements.eventsList.innerHTML = '';
      elements.noEvents.hidden = false;
      return;
    }

    elements.noEvents.hidden = true;
    elements.eventsList.innerHTML = events.map((event, i) => createEventCard(event, i)).join('');

    $$('.event-card').forEach(card => {
      card.addEventListener('click', handleEventClick);
      card.addEventListener('keydown', handleEventKeydown);
    });
  }

  function createEventCard(event, index) {
    const badgeClass = event.freiePlaetze <= 1 ? 'event-badge--last' : 
                       event.freiePlaetze <= 3 ? 'event-badge--limited' : 'event-badge--available';
    const badgeText = event.freiePlaetze <= 1 ? 'Letzter Platz!' : 
                      event.freiePlaetze <= 3 ? `Nur ${event.freiePlaetze} Plätze` : `${event.freiePlaetze} Plätze frei`;
    
    return `
      <article class="event-card" role="listitem" tabindex="0"
        data-id="${esc(event.id)}" data-name="${esc(event.name)}" aria-selected="false">
        <div class="event-header">
          <h3 class="event-name">${esc(event.name)}</h3>
          <span class="event-badge ${badgeClass}">${badgeText}</span>
        </div>
        <div class="event-meta">
          <span class="event-meta-item">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            <span>${esc(event.datum)}</span>
          </span>
          ${event.zeit ? `<span class="event-meta-item">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            <span>${esc(event.zeit)}</span>
          </span>` : ''}
          <span class="event-meta-item">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
            <span>${event.aktuelleHelfer}/${event.maxHelfer} Helfer</span>
          </span>
        </div>
        ${event.beschreibung ? `<p class="event-description">${esc(event.beschreibung)}</p>` : ''}
        <div class="event-cta" aria-hidden="true">
          <span>Jetzt anmelden</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </div>
      </article>`;
  }

  // === Event Selection ===
  function handleEventClick(e) {
    selectEvent(e.currentTarget.dataset.id, e.currentTarget.dataset.name);
  }

  function handleEventKeydown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      selectEvent(e.currentTarget.dataset.id, e.currentTarget.dataset.name);
    }
  }

  function selectEvent(eventId, eventName) {
    selectedEvent = events.find(e => e.id == eventId);
    if (!selectedEvent) return;

    $$('.event-card').forEach(card => {
      card.setAttribute('aria-selected', (card.dataset.id == eventId).toString());
    });

    elements.eventIdInput.value = eventId;
    elements.selectedEventName.textContent = eventName;
    elements.registrationSection.hidden = false;

    setTimeout(() => {
      elements.registrationSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setTimeout(() => {
        elements.nameInput.focus();
        announce(`Anmeldung für ${eventName} geöffnet`);
      }, 400);
    }, 100);
  }

  // === Keyboard Navigation ===
  function setupKeyboardNavigation() {
    elements.eventsList.addEventListener('keydown', (e) => {
      const cards = Array.from($$('.event-card'));
      const idx = cards.indexOf(document.activeElement);
      if (idx === -1) return;

      let newIdx;
      switch (e.key) {
        case 'ArrowDown': case 'ArrowRight': e.preventDefault(); newIdx = (idx + 1) % cards.length; break;
        case 'ArrowUp': case 'ArrowLeft': e.preventDefault(); newIdx = (idx - 1 + cards.length) % cards.length; break;
        case 'Home': e.preventDefault(); newIdx = 0; break;
        case 'End': e.preventDefault(); newIdx = cards.length - 1; break;
        default: return;
      }
      cards[newIdx].focus();
    });
  }

  // === Form Validation ===
  function setupFormValidation() {
    elements.form.addEventListener('submit', handleSubmit);
    elements.nameInput.addEventListener('blur', () => validateField(elements.nameInput, validateName));
    elements.emailInput.addEventListener('blur', () => validateField(elements.emailInput, validateEmail));
    elements.nameInput.addEventListener('input', () => clearFieldError(elements.nameInput));
    elements.emailInput.addEventListener('input', () => clearFieldError(elements.emailInput));
  }

  function validateField(input, validator) {
    const error = validator(input.value);
    const errorEl = $(`#${input.id}-error`);
    if (error) {
      input.setAttribute('aria-invalid', 'true');
      if (errorEl) { errorEl.textContent = error; errorEl.hidden = false; }
      return false;
    }
    input.removeAttribute('aria-invalid');
    if (errorEl) errorEl.hidden = true;
    return true;
  }

  function clearFieldError(input) {
    const errorEl = $(`#${input.id}-error`);
    if (errorEl) { input.removeAttribute('aria-invalid'); errorEl.hidden = true; }
  }

  function validateName(v) {
    v = v.trim();
    if (!v) return 'Bitte geben Sie Ihren Namen ein.';
    if (v.length < 2) return 'Der Name muss mindestens 2 Zeichen haben.';
    return null;
  }

  function validateEmail(v) {
    v = v.trim();
    if (!v) return 'Bitte geben Sie Ihre E-Mail-Adresse ein.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return 'Bitte geben Sie eine gültige E-Mail-Adresse ein.';
    return null;
  }

  // === Form Submission ===
  async function handleSubmit(e) {
    e.preventDefault();
    hideError(); hideSuccess();

    const nameValid = validateField(elements.nameInput, validateName);
    const emailValid = validateField(elements.emailInput, validateEmail);

    if (!nameValid || !emailValid) {
      (nameValid ? elements.emailInput : elements.nameInput).focus();
      announce('Bitte korrigieren Sie die markierten Felder.');
      return;
    }

    const data = {
      anlassId: elements.eventIdInput.value,
      name: elements.nameInput.value.trim(),
      email: elements.emailInput.value.trim(),
      telefon: elements.phoneInput.value.trim()
    };

    setSubmitLoading(true);

    try {
      const res = await fetch(CONFIG.API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const result = await res.json();

      if (result.success) {
        showSuccess(result.message);
        resetForm();
        announce('Anmeldung erfolgreich!');
        setTimeout(loadEvents, 2500);
      } else {
        showError(result.message || 'Ein Fehler ist aufgetreten.');
        announce(`Fehler: ${result.message}`);
      }
    } catch (err) {
      console.error('Fehler:', err);
      showError('Die Anmeldung konnte nicht gesendet werden.');
      announce('Fehler beim Senden.');
    } finally {
      setSubmitLoading(false);
    }
  }

  function setSubmitLoading(loading) {
    elements.submitBtn.disabled = loading;
    const btnContent = elements.submitBtn.querySelector('.btn-content');
    const btnLoading = elements.submitBtn.querySelector('.btn-loading');
    if (btnContent) btnContent.hidden = loading;
    if (btnLoading) btnLoading.hidden = !loading;
  }

  function resetForm() {
    elements.form.reset();
    elements.registrationSection.hidden = true;
    selectedEvent = null;
    $$('.event-card').forEach(card => card.setAttribute('aria-selected', 'false'));
  }

  window.cancelRegistration = function() {
    resetForm();
    announce('Anmeldung abgebrochen');
    elements.eventsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => { const c = $('.event-card'); if (c) c.focus(); }, 400);
  };

  // === Helpers ===
  function showLoading(show) {
    elements.loading.hidden = !show;
    elements.eventsSection.setAttribute('aria-busy', show ? 'true' : 'false');
  }

  function showError(msg) {
    elements.errorText.textContent = msg;
    elements.errorMessage.hidden = false;
    elements.errorMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function hideError() { elements.errorMessage.hidden = true; }
  window.closeError = hideError;

  function showSuccess(msg) {
    elements.successText.textContent = msg;
    elements.successMessage.hidden = false;
    elements.successMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function hideSuccess() { elements.successMessage.hidden = true; }

  function announce(msg) {
    if (elements.statusMessage) {
      elements.statusMessage.textContent = msg;
      setTimeout(() => { elements.statusMessage.textContent = ''; }, 1000);
    }
  }

  function esc(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

})();
