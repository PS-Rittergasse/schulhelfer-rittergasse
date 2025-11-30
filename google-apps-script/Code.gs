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
function sendEmailNotification(to, subject, body) {
  if (!to || !ADMIN_EMAIL) return;
  try {
    MailApp.sendEmail({
      to: to,
      subject: subject,
      body: body,
      htmlBody: body.replace(/\n/g, '<br>')
    });
  } catch (e) {
    Logger.log('Email notification failed: ' + e);
  }
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
    
    // Send email notifications
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
      message: 'Vielen Dank, ' + name + '! Sie sind für «' + anlassName + '» angemeldet.' 
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
