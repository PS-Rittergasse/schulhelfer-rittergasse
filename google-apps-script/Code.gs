/**
 * SCHULHELFER – Primarstufe Rittergasse Basel
 * Google Apps Script Backend
 * 
 * WICHTIG: Nach jeder Änderung:
 * 1. Speichern (Ctrl+S)
 * 2. Bereitstellen → Neue Bereitstellung → Web-App
 * 3. Zugriff: "Jeder" (nicht "Jeder mit Google-Konto")
 */

// === GET Requests ===
function doGet(e) {
  var output;
  
  try {
    var action = e.parameter.action || 'getEvents';
    
    if (action === 'getEvents') {
      output = JSON.stringify({ 
        success: true,
        events: getAktiveAnlaesse() 
      });
    } else {
      output = JSON.stringify({ 
        success: false,
        error: 'Unbekannte Aktion' 
      });
    }
  } catch (error) {
    output = JSON.stringify({ 
      success: false,
      error: error.message 
    });
  }
  
  return ContentService
    .createTextOutput(output)
    .setMimeType(ContentService.MimeType.JSON);
}

// === POST Requests ===
function doPost(e) {
  var output;
  
  try {
    var data = JSON.parse(e.postData.contents);
    var result = registriereHelfer(data);
    output = JSON.stringify(result);
  } catch (error) {
    output = JSON.stringify({ 
      success: false, 
      message: 'Fehler: ' + error.message 
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
    
    var datum = new Date(row[2]);
    var maxHelfer = parseInt(row[4]) || 0;
    var aktuelleHelfer = parseInt(row[5]) || 0;
    
    if (datum >= heute && aktuelleHelfer < maxHelfer) {
      anlaesse.push({
        id: String(row[0]),
        name: row[1],
        datum: formatDatum(datum),
        zeit: row[3] || '',
        beschreibung: row[6] || '',
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
  var anlassId = data.anlassId;
  var name = (data.name || '').trim();
  var email = (data.email || '').trim().toLowerCase();
  var telefon = (data.telefon || '').trim();
  
  if (!anlassId || !name || !email) {
    return { success: false, message: 'Bitte füllen Sie alle Pflichtfelder aus.' };
  }
  
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { success: false, message: 'Bitte geben Sie eine gültige E-Mail-Adresse ein.' };
  }
  
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var anlassSheet = ss.getSheetByName('Anlässe');
  var helferSheet = ss.getSheetByName('Anmeldungen');
  
  if (!anlassSheet || !helferSheet) {
    return { success: false, message: 'Systemfehler: Tabellenblätter nicht gefunden.' };
  }
  
  // Find event
  var anlassData = anlassSheet.getDataRange().getValues();
  var anlassRow = -1, anlassName = '', maxHelfer = 0, aktuelleHelfer = 0;
  
  for (var i = 1; i < anlassData.length; i++) {
    if (String(anlassData[i][0]) == String(anlassId)) {
      anlassRow = i + 1;
      anlassName = anlassData[i][1];
      maxHelfer = parseInt(anlassData[i][4]) || 0;
      aktuelleHelfer = parseInt(anlassData[i][5]) || 0;
      break;
    }
  }
  
  if (anlassRow === -1) {
    return { success: false, message: 'Der gewählte Anlass wurde nicht gefunden.' };
  }
  
  if (aktuelleHelfer >= maxHelfer) {
    return { success: false, message: 'Leider sind bereits alle Plätze vergeben.' };
  }
  
  // Check for duplicate
  var helferData = helferSheet.getDataRange().getValues();
  for (var j = 1; j < helferData.length; j++) {
    if (String(helferData[j][1]) == String(anlassId) && 
        String(helferData[j][3]).toLowerCase() == email) {
      return { success: false, message: 'Sie sind bereits für diesen Anlass angemeldet.' };
    }
  }
  
  // Register
  helferSheet.appendRow([new Date(), anlassId, name, email, telefon, anlassName]);
  anlassSheet.getRange(anlassRow, 6).setValue(aktuelleHelfer + 1);
  
  return { 
    success: true, 
    message: 'Vielen Dank, ' + name + '! Sie sind für «' + anlassName + '» angemeldet.' 
  };
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

function onOpen() {
  SpreadsheetApp.getUi().createMenu('🏰 Schulhelfer')
    .addItem('Erstes Setup', 'erstesSetup')
    .addItem('Neuer Anlass hinzufügen', 'neuerAnlassDialog')
    .addSeparator()
    .addItem('Alle Anmeldungen anzeigen', 'zeigeAnmeldungen')
    .addToUi();
}

function zeigeAnmeldungen() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Anmeldungen');
  if (sheet) {
    ss.setActiveSheet(sheet);
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
  
  // Find max ID
  var maxId = 0;
  for (var i = 1; i < values.length; i++) { 
    var id = parseInt(values[i][0]) || 0; 
    if (id > maxId) maxId = id; 
  }
  
  sheet.appendRow([
    maxId + 1, 
    data.name, 
    new Date(data.datum), 
    data.zeit || '', 
    parseInt(data.helfer), 
    0, 
    data.beschreibung || ''
  ]);
}
