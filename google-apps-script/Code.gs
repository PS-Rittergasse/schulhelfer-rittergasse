/**
 * SCHULHELFER – Primarstufe Rittergasse Basel
 * Google Apps Script Backend
 * 
 * WICHTIG: Nach jeder Änderung:
 * 1. Speichern (Ctrl+S)
 * 2. Bereitstellen → Neue Bereitstellung → Web-App
 * 3. Zugriff: "Jeder" (nicht "Jeder mit Google-Konto")
 */

// === Configuration ===
var RATE_LIMIT_WINDOW = 60; // seconds
var RATE_LIMIT_MAX_REQUESTS = 10; // max requests per window
var ADMIN_EMAIL = ''; // Set this to receive notifications (optional)

// === Utility Functions ===

/**
 * Sanitize input to prevent XSS
 */
function sanitizeInput(str) {
  if (!str) return '';
  return String(str)
    .replace(/[<>]/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+=/gi, '')
    .trim();
}

/**
 * Parse date safely
 */
function parseDate(dateValue) {
  if (!dateValue) return null;
  try {
    var date = new Date(dateValue);
    if (isNaN(date.getTime())) return null;
    return date;
  } catch (e) {
    return null;
  }
}

/**
 * Check rate limiting
 */
function checkRateLimit(identifier) {
  var props = PropertiesService.getScriptProperties();
  var key = 'rate_' + identifier;
  var now = Math.floor(Date.now() / 1000);
  var windowStart = now - RATE_LIMIT_WINDOW;
  
  var data = props.getProperty(key);
  var requests = data ? JSON.parse(data) : [];
  
  // Remove old requests outside the window
  requests = requests.filter(function(timestamp) {
    return timestamp > windowStart;
  });
  
  if (requests.length >= RATE_LIMIT_MAX_REQUESTS) {
    return false; // Rate limit exceeded
  }
  
  // Add current request
  requests.push(now);
  props.setProperty(key, JSON.stringify(requests));
  return true;
}

/**
 * Log audit trail
 */
function logAudit(action, data, success, error) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var logSheet = ss.getSheetByName('Audit-Log');
    
    if (!logSheet) {
      logSheet = ss.insertSheet('Audit-Log');
      logSheet.getRange(1, 1, 1, 6).setValues([
        ['Zeitstempel', 'Aktion', 'Daten', 'Erfolg', 'Fehler', 'IP/User']
      ]);
      logSheet.getRange(1, 1, 1, 6).setBackground('#64748b').setFontColor('white').setFontWeight('bold');
      logSheet.setColumnWidths(1, 1, 150);
      logSheet.setColumnWidths(2, 1, 120);
      logSheet.setColumnWidths(3, 1, 300);
      logSheet.setColumnWidths(4, 1, 80);
      logSheet.setColumnWidths(5, 1, 200);
      logSheet.setColumnWidths(6, 1, 150);
    }
    
    var dataStr = data ? JSON.stringify(data).substring(0, 500) : '';
    var errorStr = error ? String(error).substring(0, 200) : '';
    
    logSheet.appendRow([
      new Date(),
      action,
      dataStr,
      success ? 'Ja' : 'Nein',
      errorStr,
      Session.getActiveUser().getEmail() || 'Web-App'
    ]);
    
    // Keep only last 1000 entries
    var lastRow = logSheet.getLastRow();
    if (lastRow > 1001) {
      logSheet.deleteRows(2, lastRow - 1001);
    }
  } catch (e) {
    // Silent fail for logging
    Logger.log('Audit logging failed: ' + e);
  }
}

/**
 * Send email notification
 */
function sendEmailNotification(to, subject, body, htmlBody) {
  if (!to) return;
  try {
    MailApp.sendEmail({
      to: to,
      subject: subject,
      body: body,
      htmlBody: htmlBody || body.replace(/\n/g, '<br>')
    });
  } catch (e) {
    Logger.log('Email notification failed: ' + e);
  }
}

/**
 * Generate cancellation token
 */
function generateCancellationToken(email, anlassId) {
  var data = email + '|' + anlassId + '|' + Date.now();
  return Utilities.base64EncodeWebSafe(data);
}

/**
 * Parse cancellation token
 */
function parseCancellationToken(token) {
  try {
    var decoded = Utilities.newBlob(Utilities.base64DecodeWebSafe(token)).getDataAsString();
    var parts = decoded.split('|');
    if (parts.length >= 2) {
      return { email: parts[0], anlassId: parts[1] };
    }
    return null;
  } catch (e) {
    return null;
  }
}

/**
 * Send confirmation email to user
 */
function sendUserConfirmation(email, name, anlassName, datum, zeit, cancellationToken) {
  var subject = '✓ Anmeldung bestätigt: ' + anlassName;
  
  var htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #1a202c; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 0 auto; padding: 32px 24px; }
    .header { text-align: center; padding-bottom: 24px; border-bottom: 2px solid #e2e8f0; margin-bottom: 24px; }
    .logo { font-size: 48px; margin-bottom: 8px; }
    .title { font-size: 24px; font-weight: 700; color: #1a365d; margin: 0; }
    .subtitle { font-size: 14px; color: #718096; margin-top: 4px; }
    .success { background: #c6f6d5; border-left: 4px solid #276749; padding: 16px 20px; border-radius: 8px; margin-bottom: 24px; }
    .success h2 { color: #22543d; font-size: 18px; margin: 0 0 8px 0; }
    .success p { color: #276749; margin: 0; }
    .details { background: #f7fafc; border-radius: 8px; padding: 20px; margin-bottom: 24px; }
    .details h3 { font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em; color: #718096; margin: 0 0 12px 0; }
    .detail-row { display: flex; padding: 8px 0; border-bottom: 1px solid #e2e8f0; }
    .detail-row:last-child { border-bottom: none; }
    .detail-label { font-weight: 600; color: #4a5568; width: 120px; flex-shrink: 0; }
    .detail-value { color: #1a202c; }
    .cancel-section { text-align: center; padding: 24px; background: #fff5f5; border-radius: 8px; margin-top: 24px; }
    .cancel-section p { font-size: 14px; color: #742a2a; margin: 0 0 12px 0; }
    .cancel-link { color: #c53030; font-size: 12px; }
    .footer { text-align: center; padding-top: 24px; border-top: 1px solid #e2e8f0; margin-top: 32px; }
    .footer p { font-size: 12px; color: #a0aec0; margin: 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">🏰</div>
      <h1 class="title">Primarstufe Rittergasse</h1>
      <p class="subtitle">Kindergarten & Primarschule Basel</p>
    </div>
    
    <div class="success">
      <h2>✓ Anmeldung bestätigt!</h2>
      <p>Vielen Dank, ${name}! Ihre Anmeldung wurde erfolgreich registriert.</p>
    </div>
    
    <div class="details">
      <h3>Ihre Anmeldung</h3>
      <div class="detail-row">
        <span class="detail-label">Anlass:</span>
        <span class="detail-value"><strong>${anlassName}</strong></span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Datum:</span>
        <span class="detail-value">${datum}</span>
      </div>
      ${zeit ? `<div class="detail-row">
        <span class="detail-label">Zeit:</span>
        <span class="detail-value">${zeit}</span>
      </div>` : ''}
      <div class="detail-row">
        <span class="detail-label">Angemeldet als:</span>
        <span class="detail-value">${name}</span>
      </div>
    </div>
    
    <p style="font-size: 14px; color: #4a5568;">
      Wir freuen uns auf Ihre Unterstützung! Bei Fragen wenden Sie sich bitte an die Schulleitung.
    </p>
    
    <div class="cancel-section">
      <p>Falls Sie nicht teilnehmen können, können Sie Ihre Anmeldung hier stornieren:</p>
      <a href="CANCEL_URL_PLACEHOLDER?action=cancel&token=${cancellationToken}" class="cancel-link">
        Anmeldung stornieren
      </a>
    </div>
    
    <div class="footer">
      <p>Primarstufe Rittergasse Basel<br>
      Diese E-Mail wurde automatisch generiert.</p>
    </div>
  </div>
</body>
</html>`;

  var textBody = 'Anmeldung bestätigt: ' + anlassName + '\n\n' +
                 'Vielen Dank, ' + name + '!\n\n' +
                 'Ihre Anmeldung wurde erfolgreich registriert.\n\n' +
                 'Anlass: ' + anlassName + '\n' +
                 'Datum: ' + datum + '\n' +
                 (zeit ? 'Zeit: ' + zeit + '\n' : '') +
                 '\nWir freuen uns auf Ihre Unterstützung!\n\n' +
                 'Primarstufe Rittergasse Basel';

  sendEmailNotification(email, subject, textBody, htmlBody);
}

// === GET Requests ===
function doGet(e) {
  var output;
  var identifier = e.parameter.identifier || 'anonymous';
  
  try {
    // Rate limiting
    if (!checkRateLimit(identifier)) {
      logAudit('GET_RATE_LIMIT', { action: e.parameter.action }, false, 'Rate limit exceeded');
      output = JSON.stringify({ 
        success: false,
        error: 'Zu viele Anfragen. Bitte versuchen Sie es später erneut.' 
      });
      return ContentService
        .createTextOutput(output)
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    var action = e.parameter.action || 'getEvents';
    
    if (action === 'getEvents') {
      var events = getAktiveAnlaesse();
      output = JSON.stringify({ 
        success: true,
        events: events 
      });
      logAudit('GET_EVENTS', { count: events.length }, true, null);
    } else if (action === 'cancel') {
      var token = e.parameter.token;
      var result = cancelRegistration(token);
      output = JSON.stringify(result);
      logAudit('CANCEL_REGISTRATION', { token: token }, result.success, result.message);
    } else if (action === 'export') {
      // Data export functionality
      var result = exportData();
      output = JSON.stringify(result);
      logAudit('EXPORT_DATA', {}, result.success, result.error);
    } else {
      output = JSON.stringify({ 
        success: false,
        error: 'Unbekannte Aktion' 
      });
      logAudit('GET_UNKNOWN', { action: action }, false, 'Unknown action');
    }
  } catch (error) {
    var errorMsg = 'Ein unerwarteter Fehler ist aufgetreten.';
    logAudit('GET_ERROR', { action: e.parameter.action }, false, error.toString());
    output = JSON.stringify({ 
      success: false,
      error: errorMsg 
    });
  }
  
  return ContentService
    .createTextOutput(output)
    .setMimeType(ContentService.MimeType.JSON);
}

// === POST Requests ===
function doPost(e) {
  var output;
  var identifier = 'anonymous';
  
  try {
    var data = JSON.parse(e.postData.contents);
    identifier = data.email || 'anonymous';
    
    // Rate limiting
    if (!checkRateLimit(identifier)) {
      logAudit('POST_RATE_LIMIT', { anlassId: data.anlassId }, false, 'Rate limit exceeded');
      output = JSON.stringify({ 
        success: false, 
        message: 'Zu viele Anfragen. Bitte versuchen Sie es später erneut.' 
      });
      return ContentService
        .createTextOutput(output)
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    var result = registriereHelfer(data);
    logAudit('REGISTRATION', { anlassId: data.anlassId, email: data.email }, result.success, result.message);
    output = JSON.stringify(result);
  } catch (error) {
    var errorMsg = 'Ein unerwarteter Fehler ist aufgetreten. Bitte versuchen Sie es später erneut.';
    logAudit('POST_ERROR', {}, false, error.toString());
    output = JSON.stringify({ 
      success: false, 
      message: errorMsg 
    });
  }
  
  return ContentService
    .createTextOutput(output)
    .setMimeType(ContentService.MimeType.JSON);
}

// === Get Active Events ===
function getAktiveAnlaesse() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Anlässe');
  if (!sheet) return [];
  
  var data = sheet.getDataRange().getValues();
  var heute = new Date();
  heute.setHours(0, 0, 0, 0);
  
  var anlaesse = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[0]) continue;
    
    // Improved date parsing
    var datum = parseDate(row[2]);
    if (!datum) continue; // Skip invalid dates
    
    var maxHelfer = parseInt(row[4]) || 0;
    var aktuelleHelfer = parseInt(row[5]) || 0;
    
    // Normalize dates for comparison
    var datumNormalized = new Date(datum);
    datumNormalized.setHours(0, 0, 0, 0);
    
    if (datumNormalized >= heute && aktuelleHelfer < maxHelfer) {
      anlaesse.push({
        id: String(row[0]),
        name: sanitizeInput(row[1]),
        datum: formatDatum(datum),
        zeit: sanitizeInput(row[3] || ''),
        beschreibung: sanitizeInput(row[6] || ''),
        maxHelfer: maxHelfer,
        aktuelleHelfer: aktuelleHelfer,
        freiePlaetze: maxHelfer - aktuelleHelfer
      });
    }
  }
  return anlaesse;
}

function formatDatum(datum) {
  var tage = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
  var monate = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  return tage[datum.getDay()] + ', ' + datum.getDate() + '. ' + monate[datum.getMonth()] + ' ' + datum.getFullYear();
}

// === Register Helper ===
function registriereHelfer(data) {
  // Sanitize and validate input
  var anlassId = sanitizeInput(data.anlassId);
  var name = sanitizeInput(data.name || '');
  var email = (data.email || '').trim().toLowerCase();
  var telefon = sanitizeInput(data.telefon || '');
  
  // Validation
  if (!anlassId || !name || !email) {
    return { success: false, message: 'Bitte füllen Sie alle Pflichtfelder aus.' };
  }
  
  if (name.length < 2) {
    return { success: false, message: 'Der Name muss mindestens 2 Zeichen lang sein.' };
  }
  
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { success: false, message: 'Bitte geben Sie eine gültige E-Mail-Adresse ein.' };
  }
  
  // Email length check
  if (email.length > 254) {
    return { success: false, message: 'Die E-Mail-Adresse ist zu lang.' };
  }
  
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var anlassSheet = ss.getSheetByName('Anlässe');
  var helferSheet = ss.getSheetByName('Anmeldungen');
  
  if (!anlassSheet || !helferSheet) {
    return { success: false, message: 'Der Anlass konnte nicht verarbeitet werden. Bitte versuchen Sie es später erneut.' };
  }
  
  // Use LockService to prevent race conditions
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000); // Wait up to 10 seconds
    
    // Find event
    var anlassData = anlassSheet.getDataRange().getValues();
    var anlassRow = -1, anlassName = '', maxHelfer = 0, aktuelleHelfer = 0;
    
    for (var i = 1; i < anlassData.length; i++) {
      if (String(anlassData[i][0]) == String(anlassId)) {
        anlassRow = i + 1;
        anlassName = sanitizeInput(anlassData[i][1] || '');
        maxHelfer = parseInt(anlassData[i][4]) || 0;
        aktuelleHelfer = parseInt(anlassData[i][5]) || 0;
        break;
      }
    }
    
    if (anlassRow === -1) {
      lock.releaseLock();
      return { success: false, message: 'Der gewählte Anlass wurde nicht gefunden.' };
    }
    
    // Re-check capacity after lock (prevent race condition)
    if (aktuelleHelfer >= maxHelfer) {
      lock.releaseLock();
      return { success: false, message: 'Leider sind bereits alle Plätze vergeben.' };
    }
    
    // Improved duplicate check: name + email combination
    var helferData = helferSheet.getDataRange().getValues();
    for (var j = 1; j < helferData.length; j++) {
      var existingEmail = String(helferData[j][3] || '').toLowerCase();
      var existingName = String(helferData[j][2] || '').toLowerCase();
      var existingAnlassId = String(helferData[j][1] || '');
      
      if (existingAnlassId == anlassId && 
          existingEmail == email && 
          existingName == name.toLowerCase()) {
        lock.releaseLock();
        return { success: false, message: 'Sie sind bereits für diesen Anlass angemeldet.' };
      }
    }
    
    // Register (transaction-safe)
    helferSheet.appendRow([
      new Date(), 
      anlassId, 
      name, 
      email, 
      telefon, 
      anlassName
    ]);
    anlassSheet.getRange(anlassRow, 6).setValue(aktuelleHelfer + 1);
    
    lock.releaseLock();
    
    // Get event date and time for confirmation email
    var eventDatum = '';
    var eventZeit = '';
    for (var k = 1; k < anlassData.length; k++) {
      if (String(anlassData[k][0]) == String(anlassId)) {
        var datumValue = anlassData[k][2];
        if (datumValue) {
          eventDatum = formatDatum(new Date(datumValue));
        }
        eventZeit = anlassData[k][3] || '';
        break;
      }
    }
    
    // Generate cancellation token
    var cancellationToken = generateCancellationToken(email, anlassId);
    
    // Send confirmation email to user
    sendUserConfirmation(email, name, anlassName, eventDatum, eventZeit, cancellationToken);
    
    // Send email notification to admin
    if (ADMIN_EMAIL) {
      var emailBody = 'Neue Anmeldung für Schulhelfer:\n\n' +
                     'Anlass: ' + anlassName + '\n' +
                     'Name: ' + name + '\n' +
                     'E-Mail: ' + email + '\n' +
                     (telefon ? 'Telefon: ' + telefon + '\n' : '') +
                     'Datum: ' + new Date().toLocaleString('de-CH');
      
      sendEmailNotification(ADMIN_EMAIL, 'Neue Anmeldung: ' + anlassName, emailBody);
    }
    
    return { 
      success: true, 
      message: 'Vielen Dank, ' + name + '! Sie sind für «' + anlassName + '» angemeldet. Eine Bestätigung wurde an ' + email + ' gesendet.' 
    };
    
  } catch (e) {
    if (lock.hasLock()) {
      lock.releaseLock();
    }
    return { success: false, message: 'Ein Fehler ist aufgetreten. Bitte versuchen Sie es erneut.' };
  }
}

// === Cancel Registration ===
function cancelRegistration(token) {
  if (!token) {
    return { success: false, message: 'Ungültiger Stornierungslink.' };
  }
  
  var tokenData = parseCancellationToken(token);
  if (!tokenData) {
    return { success: false, message: 'Ungültiger oder abgelaufener Stornierungslink.' };
  }
  
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var helferSheet = ss.getSheetByName('Anmeldungen');
  var anlassSheet = ss.getSheetByName('Anlässe');
  
  if (!helferSheet || !anlassSheet) {
    return { success: false, message: 'Systemfehler. Bitte kontaktieren Sie die Schulleitung.' };
  }
  
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    
    var helferData = helferSheet.getDataRange().getValues();
    var rowToDelete = -1;
    var anlassId = '';
    var anlassName = '';
    var helferName = '';
    
    for (var i = 1; i < helferData.length; i++) {
      var rowEmail = String(helferData[i][3] || '').toLowerCase();
      var rowAnlassId = String(helferData[i][1] || '');
      
      if (rowEmail == tokenData.email.toLowerCase() && rowAnlassId == tokenData.anlassId) {
        rowToDelete = i + 1; // 1-based row number
        anlassId = rowAnlassId;
        anlassName = helferData[i][5] || '';
        helferName = helferData[i][2] || '';
        break;
      }
    }
    
    if (rowToDelete === -1) {
      lock.releaseLock();
      return { success: false, message: 'Diese Anmeldung wurde nicht gefunden oder wurde bereits storniert.' };
    }
    
    // Delete the registration row
    helferSheet.deleteRow(rowToDelete);
    
    // Update the helper count in Anlässe
    var anlassData = anlassSheet.getDataRange().getValues();
    for (var j = 1; j < anlassData.length; j++) {
      if (String(anlassData[j][0]) == anlassId) {
        var currentCount = parseInt(anlassData[j][5]) || 0;
        if (currentCount > 0) {
          anlassSheet.getRange(j + 1, 6).setValue(currentCount - 1);
        }
        break;
      }
    }
    
    lock.releaseLock();
    
    // Log the cancellation
    logAudit('REGISTRATION_CANCELLED', { email: tokenData.email, anlassId: anlassId, name: helferName }, true, null);
    
    return { 
      success: true, 
      message: 'Ihre Anmeldung für «' + anlassName + '» wurde erfolgreich storniert. Vielen Dank für die Rückmeldung!' 
    };
    
  } catch (e) {
    if (lock.hasLock()) {
      lock.releaseLock();
    }
    return { success: false, message: 'Ein Fehler ist aufgetreten. Bitte versuchen Sie es erneut.' };
  }
}

// === Setup ===
function erstesSetup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // Create Anlässe sheet
  var anlassSheet = ss.getSheetByName('Anlässe') || ss.insertSheet('Anlässe');
  anlassSheet.clear();
  anlassSheet.getRange(1, 1, 1, 7).setValues([
    ['ID', 'Name', 'Datum', 'Zeit', 'Benötigte Helfer', 'Angemeldete', 'Beschreibung']
  ]);
  anlassSheet.getRange(1, 1, 1, 7).setBackground('#1e3a5f').setFontColor('white').setFontWeight('bold');
  
  // Add sample events
  var beispiele = [
    ['1', 'Sommerfest', new Date(Date.now() + 30*24*60*60*1000), '14:00-18:00', 5, 0, 'Hilfe beim Aufbau und Grill'],
    ['2', 'Schulaufführung', new Date(Date.now() + 45*24*60*60*1000), '18:00-21:00', 3, 0, 'Garderobe und Einlass'],
    ['3', 'Sporttag', new Date(Date.now() + 60*24*60*60*1000), '08:00-16:00', 8, 0, 'Posten betreuen']
  ];
  anlassSheet.getRange(2, 1, 3, 7).setValues(beispiele);
  anlassSheet.setColumnWidths(1, 1, 50);
  anlassSheet.setColumnWidths(2, 1, 200);
  anlassSheet.setColumnWidths(3, 1, 120);
  anlassSheet.setColumnWidths(7, 1, 250);
  
  // Create Anmeldungen sheet
  var helferSheet = ss.getSheetByName('Anmeldungen') || ss.insertSheet('Anmeldungen');
  helferSheet.clear();
  helferSheet.getRange(1, 1, 1, 6).setValues([
    ['Zeitstempel', 'Anlass-ID', 'Name', 'E-Mail', 'Telefon', 'Anlass']
  ]);
  helferSheet.getRange(1, 1, 1, 6).setBackground('#1a7d36').setFontColor('white').setFontWeight('bold');
  
  // Remove default sheet
  try { 
    var s1 = ss.getSheetByName('Sheet1') || ss.getSheetByName('Tabelle1'); 
    if (s1) ss.deleteSheet(s1); 
  } catch(e) {}
  
  SpreadsheetApp.getUi().alert(
    '✅ Setup abgeschlossen!\n\n' +
    'Nächster Schritt:\n' +
    '1. Klicken Sie auf "Bereitstellen" → "Neue Bereitstellung"\n' +
    '2. Typ: Web-App\n' +
    '3. Ausführen als: Ich\n' +
    '4. Zugriff: JEDER (wichtig!)\n' +
    '5. Kopieren Sie die URL'
  );
}

// === Export Data ===
function exportData() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var anlassSheet = ss.getSheetByName('Anlässe');
    var helferSheet = ss.getSheetByName('Anmeldungen');
    
    if (!anlassSheet || !helferSheet) {
      return { success: false, error: 'Tabellenblätter nicht gefunden' };
    }
    
    var anlaesse = anlassSheet.getDataRange().getValues();
    var anmeldungen = helferSheet.getDataRange().getValues();
    
    // Convert to CSV format
    var csv = '';
    
    // Export Anlässe
    csv += '=== ANLÄSSE ===\n';
    for (var i = 0; i < anlaesse.length; i++) {
      csv += anlaesse[i].join(',') + '\n';
    }
    
    csv += '\n=== ANMELDUNGEN ===\n';
    for (var j = 0; j < anmeldungen.length; j++) {
      csv += anmeldungen[j].join(',') + '\n';
    }
    
    return { success: true, data: csv };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

function exportDataAsCSV() {
  var result = exportData();
  if (result.success) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var exportSheet = ss.getSheetByName('Export') || ss.insertSheet('Export');
    exportSheet.clear();
    
    var lines = result.data.split('\n');
    var data = [];
    for (var i = 0; i < lines.length; i++) {
      if (lines[i]) {
        data.push([lines[i]]);
      }
    }
    
    if (data.length > 0) {
      exportSheet.getRange(1, 1, data.length, 1).setValues(data);
      ss.setActiveSheet(exportSheet);
      SpreadsheetApp.getUi().alert('Export erfolgreich! Die Daten wurden im Tab "Export" gespeichert.');
    }
  } else {
    SpreadsheetApp.getUi().alert('Fehler beim Export: ' + result.error);
  }
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('🏰 Schulhelfer')
    .addItem('Erstes Setup', 'erstesSetup')
    .addItem('Neuer Anlass hinzufügen', 'neuerAnlassDialog')
    .addSeparator()
    .addItem('Alle Anmeldungen anzeigen', 'zeigeAnmeldungen')
    .addItem('Daten exportieren (CSV)', 'exportDataAsCSV')
    .addSeparator()
    .addItem('Audit-Log anzeigen', 'zeigeAuditLog')
    .addToUi();
}

function zeigeAnmeldungen() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Anmeldungen');
  if (sheet) {
    ss.setActiveSheet(sheet);
  }
}

function zeigeAuditLog() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Audit-Log');
  if (sheet) {
    ss.setActiveSheet(sheet);
  } else {
    SpreadsheetApp.getUi().alert('Noch keine Audit-Logs vorhanden.');
  }
}

function neuerAnlassDialog() {
  var html = HtmlService.createHtmlOutput(`
    <style>
      body { font-family: Arial, sans-serif; padding: 16px; }
      label { display: block; margin-top: 12px; font-weight: bold; color: #333; }
      input, textarea { 
        width: 100%; padding: 10px; margin-top: 4px; 
        border: 1px solid #ddd; border-radius: 6px; 
        box-sizing: border-box; font-size: 14px;
      }
      input:focus, textarea:focus { outline: none; border-color: #1e3a5f; }
      button { 
        margin-top: 20px; padding: 12px 24px; 
        background: #1e3a5f; color: white; 
        border: none; border-radius: 6px; 
        cursor: pointer; font-size: 14px; font-weight: bold;
      }
      button:hover { background: #2d5a8a; }
    </style>
    <form id="f">
      <label>Name des Anlasses *</label>
      <input id="n" required placeholder="z.B. Sommerfest">
      
      <label>Datum *</label>
      <input type="date" id="d" required>
      
      <label>Zeit (optional)</label>
      <input id="z" placeholder="z.B. 14:00-18:00">
      
      <label>Anzahl benötigter Helfer *</label>
      <input type="number" id="h" min="1" required placeholder="z.B. 5">
      
      <label>Beschreibung (optional)</label>
      <textarea id="b" rows="2" placeholder="Was sollen die Helfer tun?"></textarea>
      
      <button type="submit">✓ Anlass erstellen</button>
    </form>
    <script>
      document.getElementById("f").onsubmit = function(e) {
        e.preventDefault();
        google.script.run
          .withSuccessHandler(function() {
            alert('Anlass erfolgreich erstellt!');
            google.script.host.close();
          })
          .withFailureHandler(function(err) {
            alert('Fehler: ' + err);
          })
          .anlassHinzufuegen({
            name: document.getElementById("n").value,
            datum: document.getElementById("d").value,
            zeit: document.getElementById("z").value,
            helfer: document.getElementById("h").value,
            beschreibung: document.getElementById("b").value
          });
      };
    </script>
  `).setWidth(380).setHeight(420);
  
  SpreadsheetApp.getUi().showModalDialog(html, '🏰 Neuer Anlass');
}

function anlassHinzufuegen(data) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Anlässe');
  var values = sheet.getDataRange().getValues();
  
  // Sanitize input
  var name = sanitizeInput(data.name || '');
  var zeit = sanitizeInput(data.zeit || '');
  var beschreibung = sanitizeInput(data.beschreibung || '');
  var helfer = parseInt(data.helfer) || 0;
  
  if (!name || helfer < 1) {
    throw new Error('Bitte füllen Sie alle Pflichtfelder aus.');
  }
  
  // Validate date
  var datum = parseDate(data.datum);
  if (!datum) {
    throw new Error('Ungültiges Datum.');
  }
  
  // Find max ID
  var maxId = 0;
  for (var i = 1; i < values.length; i++) { 
    var id = parseInt(values[i][0]) || 0; 
    if (id > maxId) maxId = id; 
  }
  
  sheet.appendRow([
    maxId + 1, 
    name, 
    datum, 
    zeit, 
    helfer, 
    0, 
    beschreibung
  ]);
  
  logAudit('ANLASS_HINZUGEFUEGT', { name: name, datum: datum }, true, null);
}
