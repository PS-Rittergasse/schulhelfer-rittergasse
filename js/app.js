/**
 * SCHULHELFER – Primarstufe Rittergasse Basel
 * Barrierefreie JavaScript-Interaktion
 */

(function() {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const el = {
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

  let events = [];
  let selectedEvent = null;
  let retryCount = 0;
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 1000; // ms

  // Generate unique identifier for rate limiting
  function getIdentifier() {
    let id = localStorage.getItem('userIdentifier');
    if (!id) {
      id = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('userIdentifier', id);
    }
    return id;
  }

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    if (!CONFIG.API_URL || CONFIG.API_URL === 'IHRE_GOOGLE_APPS_SCRIPT_URL_HIER') {
      showError('Bitte konfigurieren Sie die API_URL in index.html mit Ihrer Google Apps Script URL.');
      return;
    }
    loadEvents();
    setupFormValidation();
    setupKeyboardNavigation();
    restoreFormData();
    setupFormPersistence();
  }

  // === Load Events with Retry Logic ===
  async function loadEvents(retryAttempt = 0) {
    showLoading(true);
    hideError();
    
    try {
      // Build URL with cache-busting and identifier
      const identifier = getIdentifier();
      const url = `${CONFIG.API_URL}?action=getEvents&identifier=${encodeURIComponent(identifier)}&_=${Date.now()}`;
      
      // Create timeout controller for older browsers
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      const response = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Server-Fehler: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error);
      }

      events = data.events || [];
      renderEvents();
      retryCount = 0; // Reset on success
      announce(`${events.length} ${events.length === 1 ? 'Anlass' : 'Anlässe'} gefunden`);
      
    } catch (error) {
      console.error('Fehler beim Laden:', error);
      
      // Retry logic for network failures
      if (retryAttempt < MAX_RETRIES && (
        error.message.includes('Failed to fetch') || 
        error.message.includes('network') ||
        error.name === 'TimeoutError' ||
        error.name === 'AbortError'
      )) {
        retryAttempt++;
        retryCount = retryAttempt;
        announce(`Verbindungsfehler. Versuch ${retryAttempt}/${MAX_RETRIES}...`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * retryAttempt));
        return loadEvents(retryAttempt);
      }
      
      // More helpful error message
      let message = 'Die Anlässe konnten nicht geladen werden.';
      if (error.message.includes('Failed to fetch') || error.message.includes('CORS') || error.name === 'TimeoutError') {
        message = 'Verbindungsfehler. Bitte prüfen Sie:\n' +
                  '1. Ist die Google Apps Script URL korrekt?\n' +
                  '2. Wurde die Web-App als "Jeder" (nicht "Jeder mit Google-Konto") freigegeben?\n' +
                  '3. Wurde nach Code-Änderungen eine NEUE Bereitstellung erstellt?\n' +
                  '4. Ist Ihre Internetverbindung aktiv?';
      } else if (error.message.includes('Rate limit')) {
        message = 'Zu viele Anfragen. Bitte warten Sie einen Moment und versuchen Sie es erneut.';
      }
      showError(message);
    } finally {
      showLoading(false);
    }
  }

  // === Render Events ===
  function renderEvents() {
    if (events.length === 0) {
      el.eventsList.innerHTML = '';
      el.noEvents.hidden = false;
      return;
    }

    el.noEvents.hidden = true;
    el.eventsList.innerHTML = events.map((event, i) => createEventCard(event, i)).join('');

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

    el.eventIdInput.value = eventId;
    el.selectedEventName.textContent = eventName;
    el.registrationSection.hidden = false;

    setTimeout(() => {
      el.registrationSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setTimeout(() => {
        el.nameInput.focus();
        announce(`Anmeldung für ${eventName} geöffnet`);
      }, 400);
    }, 100);
  }

  // === Keyboard Navigation ===
  function setupKeyboardNavigation() {
    el.eventsList.addEventListener('keydown', (e) => {
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

  // === Form Persistence ===
  function setupFormPersistence() {
    // Save form data on input
    [el.nameInput, el.emailInput, el.phoneInput].forEach(input => {
      input.addEventListener('input', () => {
        saveFormData();
      });
    });
    
    // Clear saved data on successful submission
    el.form.addEventListener('submit', () => {
      // Will be cleared after successful submission
    });
  }

  function saveFormData() {
    const formData = {
      name: el.nameInput.value,
      email: el.emailInput.value,
      phone: el.phoneInput.value,
      eventId: el.eventIdInput.value,
      timestamp: Date.now()
    };
    localStorage.setItem('schulhelfer_form', JSON.stringify(formData));
  }

  function restoreFormData() {
    try {
      const saved = localStorage.getItem('schulhelfer_form');
      if (saved) {
        const formData = JSON.parse(saved);
        // Only restore if less than 1 hour old
        if (Date.now() - formData.timestamp < 3600000) {
          if (formData.name) el.nameInput.value = formData.name;
          if (formData.email) el.emailInput.value = formData.email;
          if (formData.phone) el.phoneInput.value = formData.phone;
          if (formData.eventId) {
            // Try to restore the selected event
            const event = events.find(e => e.id == formData.eventId);
            if (event) {
              selectEvent(event.id, event.name);
            }
          }
        } else {
          // Clear old data
          localStorage.removeItem('schulhelfer_form');
        }
      }
    } catch (e) {
      console.warn('Could not restore form data:', e);
    }
  }

  function clearFormData() {
    localStorage.removeItem('schulhelfer_form');
  }

  // === Form ===
  function setupFormValidation() {
    el.form.addEventListener('submit', handleSubmit);
    el.nameInput.addEventListener('blur', () => validateField(el.nameInput, validateName));
    el.emailInput.addEventListener('blur', () => validateField(el.emailInput, validateEmail));
    el.nameInput.addEventListener('input', () => {
      clearFieldError(el.nameInput);
      saveFormData();
    });
    el.emailInput.addEventListener('input', () => {
      clearFieldError(el.emailInput);
      saveFormData();
    });
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

  // === Submit with Retry Logic ===
  async function handleSubmit(e) {
    e.preventDefault();
    hideError();
    hideSuccess();

    const nameValid = validateField(el.nameInput, validateName);
    const emailValid = validateField(el.emailInput, validateEmail);

    if (!nameValid || !emailValid) {
      (nameValid ? el.emailInput : el.nameInput).focus();
      announce('Bitte korrigieren Sie die markierten Felder.');
      return;
    }

    const data = {
      anlassId: el.eventIdInput.value,
      name: el.nameInput.value.trim(),
      email: el.emailInput.value.trim(),
      telefon: el.phoneInput.value.trim(),
      identifier: getIdentifier()
    };

    setSubmitLoading(true);

    try {
      const result = await submitWithRetry(data, 0);

      if (result.success) {
        showSuccess(result.message);
        clearFormData(); // Clear saved form data on success
        resetForm();
        announce('Anmeldung erfolgreich!');
        setTimeout(loadEvents, 2000);
      } else {
        showError(result.message || 'Ein Fehler ist aufgetreten.');
        announce(`Fehler: ${result.message}`);
      }
    } catch (error) {
      console.error('Fehler beim Senden:', error);
      showError('Die Anmeldung konnte nicht gesendet werden. Bitte versuchen Sie es später erneut.');
      announce('Fehler beim Senden.');
    } finally {
      setSubmitLoading(false);
    }
  }

  async function submitWithRetry(data, retryAttempt = 0) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

      const response = await fetch(CONFIG.API_URL, {
        method: 'POST',
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(data),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Server-Fehler: ${response.status}`);
      }

      const result = await response.json();
      
      if (!result.success && retryAttempt < MAX_RETRIES && (
        result.message && result.message.includes('Rate limit')
      )) {
        // Retry on rate limit after delay
        retryAttempt++;
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * retryAttempt * 2));
        return submitWithRetry(data, retryAttempt);
      }

      return result;
    } catch (error) {
      // Retry on network errors
      if (retryAttempt < MAX_RETRIES && (
        error.name === 'AbortError' ||
        error.message.includes('Failed to fetch') ||
        error.message.includes('network')
      )) {
        retryAttempt++;
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * retryAttempt));
        return submitWithRetry(data, retryAttempt);
      }
      throw error;
    }
  }

  function setSubmitLoading(loading) {
    el.submitBtn.disabled = loading;
    const btnContent = el.submitBtn.querySelector('.btn-content');
    const btnLoading = el.submitBtn.querySelector('.btn-loading');
    if (btnContent) btnContent.hidden = loading;
    if (btnLoading) btnLoading.hidden = !loading;
  }

  function resetForm() {
    el.form.reset();
    el.registrationSection.hidden = true;
    selectedEvent = null;
    $$('.event-card').forEach(card => card.setAttribute('aria-selected', 'false'));
    clearFormData();
  }

  window.cancelRegistration = function() {
    resetForm();
    announce('Anmeldung abgebrochen');
    el.eventsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => { const c = $('.event-card'); if (c) c.focus(); }, 400);
  };

  // === Helpers ===
  function showLoading(show) {
    el.loading.hidden = !show;
    el.eventsSection.setAttribute('aria-busy', show ? 'true' : 'false');
  }

  function showError(msg) {
    el.errorText.textContent = msg;
    el.errorMessage.hidden = false;
    el.errorMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function hideError() { el.errorMessage.hidden = true; }
  window.closeError = hideError;

  function showSuccess(msg) {
    el.successText.textContent = msg;
    el.successMessage.hidden = false;
    el.successMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function hideSuccess() { el.successMessage.hidden = true; }

  function announce(msg) {
    if (el.statusMessage) {
      el.statusMessage.textContent = msg;
      setTimeout(() => { el.statusMessage.textContent = ''; }, 1000);
    }
  }

  function esc(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

})();
