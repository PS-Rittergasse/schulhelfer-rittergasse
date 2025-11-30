/**
 * SCHULHELFER – Primarstufe Rittergasse Basel
 * Google Apps Script Backend
 */

// === CORS Headers ===
function addCorsHeaders(response) {
  return response
    .setHeader('Access-Control-Allow-Origin', '*')
    .setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    .setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// === GET Requests ===
function doGet(e) {
  try {
    var action = e.parameter.action || 'getEvents';
    var result = action === 'getEvents' ? { events: getAktiveAnlaesse() } : { error: 'Unbekannte Aktion' };
    return addCorsHeaders(ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON));
  } catch (error) {
    return addCorsHeaders(ContentService.createTextOutput(JSON.stringify({ error: error.message })).setMimeType(ContentService.MimeType.JSON));
  }
}

// === POST Requests ===
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var result = registriereHelfer(data);
    return addCorsHeaders(ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON));
  } catch (error) {
    return addCorsHeaders(ContentService.createTextOutput(JSON.stringify({ success: false, message: error.message })).setMimeType(ContentService.MimeType.JSON));
  }
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
  
  if (!anlassId || !name || !email) return { success: false, message: 'Bitte füllen Sie alle Pflichtfelder aus.' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { success: false, message: 'Bitte geben Sie eine gültige E-Mail-Adresse ein.' };
  
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var anlassSheet = ss.getSheetByName('Anlässe');
  var helferSheet = ss.getSheetByName('Anmeldungen');
  
  if (!anlassSheet || !helferSheet) return { success: false, message: 'Systemfehler: Tabellenblätter nicht gefunden.' };
  
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
  
  if (anlassRow === -1) return { success: false, message: 'Der gewählte Anlass wurde nicht gefunden.' };
  if (aktuelleHelfer >= maxHelfer) return { success: false, message: 'Leider sind bereits alle Plätze vergeben.' };
  
  var helferData = helferSheet.getDataRange().getValues();
  for (var j = 1; j < helferData.length; j++) {
    if (String(helferData[j][1]) == String(anlassId) && String(helferData[j][3]).toLowerCase() == email) {
      return { success: false, message: 'Sie sind bereits für diesen Anlass angemeldet.' };
    }
  }
  
  helferSheet.appendRow([new Date(), anlassId, name, email, telefon, anlassName]);
  anlassSheet.getRange(anlassRow, 6).setValue(aktuelleHelfer + 1);
  
  return { success: true, message: 'Vielen Dank, ' + name + '! Sie sind für «' + anlassName + '» angemeldet.' };
}

// === Setup ===
function erstesSetup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  var anlassSheet = ss.getSheetByName('Anlässe') || ss.insertSheet('Anlässe');
  anlassSheet.clear();
  anlassSheet.getRange(1, 1, 1, 7).setValues([['ID', 'Name', 'Datum', 'Zeit', 'Benötigte Helfer', 'Angemeldete', 'Beschreibung']]);
  anlassSheet.getRange(1, 1, 1, 7).setBackground('#1e3a5f').setFontColor('white').setFontWeight('bold');
  
  var beispiele = [
    ['1', 'Sommerfest', new Date(Date.now() + 30*24*60*60*1000), '14:00-18:00', 5, 0, 'Hilfe beim Aufbau und Grill'],
    ['2', 'Schulaufführung', new Date(Date.now() + 45*24*60*60*1000), '18:00-21:00', 3, 0, 'Garderobe und Einlass'],
    ['3', 'Sporttag', new Date(Date.now() + 60*24*60*60*1000), '08:00-16:00', 8, 0, 'Posten betreuen']
  ];
  anlassSheet.getRange(2, 1, 3, 7).setValues(beispiele);
  
  var helferSheet = ss.getSheetByName('Anmeldungen') || ss.insertSheet('Anmeldungen');
  helferSheet.clear();
  helferSheet.getRange(1, 1, 1, 6).setValues([['Zeitstempel', 'Anlass-ID', 'Name', 'E-Mail', 'Telefon', 'Anlass']]);
  helferSheet.getRange(1, 1, 1, 6).setBackground('#1a7d36').setFontColor('white').setFontWeight('bold');
  
  try { var s1 = ss.getSheetByName('Sheet1'); if (s1) ss.deleteSheet(s1); } catch(e) {}
  
  SpreadsheetApp.getUi().alert('Setup abgeschlossen!\n\nNächster Schritt: Bereitstellen > Als Web-App > Zugriff: "Jeder"');
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('🏰 Schulhelfer')
    .addItem('Erstes Setup', 'erstesSetup')
    .addItem('Neuer Anlass', 'neuerAnlassDialog')
    .addToUi();
}

function neuerAnlassDialog() {
  var html = HtmlService.createHtmlOutput(
    '<style>body{font-family:Arial;padding:15px}label{display:block;margin-top:10px;font-weight:bold}input,textarea{width:100%;padding:8px;margin-top:5px;box-sizing:border-box}button{margin-top:15px;padding:10px 20px;background:#1e3a5f;color:white;border:none;cursor:pointer}</style>' +
    '<form id="f"><label>Name*</label><input id="n" required><label>Datum*</label><input type="date" id="d" required><label>Zeit</label><input id="z" placeholder="14:00-18:00"><label>Helfer*</label><input type="number" id="h" min="1" required><label>Beschreibung</label><textarea id="b" rows="2"></textarea><button type="submit">Erstellen</button></form>' +
    '<script>document.getElementById("f").onsubmit=function(e){e.preventDefault();google.script.run.withSuccessHandler(function(){alert("Erstellt!");google.script.host.close()}).anlassHinzufuegen({name:document.getElementById("n").value,datum:document.getElementById("d").value,zeit:document.getElementById("z").value,helfer:document.getElementById("h").value,beschreibung:document.getElementById("b").value})};</script>'
  ).setWidth(350).setHeight(380);
  SpreadsheetApp.getUi().showModalDialog(html, 'Neuer Anlass');
}

function anlassHinzufuegen(data) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Anlässe');
  var values = sheet.getDataRange().getValues();
  var maxId = 0;
  for (var i = 1; i < values.length; i++) { var id = parseInt(values[i][0]) || 0; if (id > maxId) maxId = id; }
  sheet.appendRow([maxId + 1, data.name, new Date(data.datum), data.zeit || '', parseInt(data.helfer), 0, data.beschreibung || '']);
}
