# 🏰 Schulhelfer – Primarstufe Rittergasse Basel

**Helferanmeldung für Schulanlässe** der Primarstufe Rittergasse Basel (Kindergarten & Primarschule).

Ein barrierefreies, mobil-optimiertes Tool zur Rekrutierung von Eltern-Helfern für Schulveranstaltungen.

---

## ✨ Features

- 📱 **Mobile-First Design** – Perfekt für Smartphones
- ♿ **WCAG 2.1 AA** – Vollständig barrierefrei
- 🌙 **Dark Mode** – Automatische Anpassung
- 🔒 **Keine Datenbank** – Daten in Google Sheets
- ⚡ **Schnell** – Lädt in unter 2 Sekunden

---

## 📁 Projektstruktur

```
schulhelfer/
├── index.html              ← Hauptseite
├── css/styles.css          ← Styling
├── js/app.js               ← Interaktion
├── google-apps-script/
│   └── Code.gs             ← Backend
└── README.md
```

---

## 🚀 Einrichtung

### Schritt 1: Google Sheet einrichten

1. Öffnen Sie [Google Sheets](https://sheets.google.com)
2. Erstellen Sie eine neue Tabelle
3. Gehen Sie zu **Erweiterungen → Apps Script**
4. Löschen Sie den vorhandenen Code
5. Kopieren Sie den Inhalt von `google-apps-script/Code.gs`
6. Speichern Sie (Ctrl+S)
7. Führen Sie `erstesSetup` aus dem Dropdown aus
8. Erlauben Sie die Berechtigungen

### Schritt 2: Als Web-App bereitstellen

1. Klicken Sie auf **Bereitstellen → Neue Bereitstellung**
2. Wählen Sie Typ: **Web-App**
3. Einstellungen:
   - **Ausführen als:** Ich
   - **Zugriff:** Jeder
4. Klicken Sie auf **Bereitstellen**
5. **Kopieren Sie die URL** (beginnt mit `https://script.google.com/...`)

### Schritt 3: GitHub Repository erstellen

1. Erstellen Sie ein neues Repository auf GitHub
2. Laden Sie alle Dateien hoch
3. Öffnen Sie `index.html`
4. Ersetzen Sie `IHRE_GOOGLE_APPS_SCRIPT_URL_HIER` mit der kopierten URL
5. Committen Sie die Änderung

### Schritt 4: GitHub Pages aktivieren

1. Gehen Sie zu **Settings → Pages**
2. Source: **Deploy from a branch**
3. Branch: **main**, Ordner: **/ (root)**
4. Klicken Sie **Save**
5. Nach ca. 1 Minute ist Ihre Seite unter `https://BENUTZERNAME.github.io/REPONAME/` verfügbar

---

## 📊 Google Sheet Struktur

### Anlässe (automatisch erstellt)
| ID | Name | Datum | Zeit | Benötigte Helfer | Angemeldete | Beschreibung |
|----|------|-------|------|------------------|-------------|--------------|
| 1  | Sommerfest | 15.07.2025 | 14:00-18:00 | 5 | 2 | Hilfe beim Grill |

### Anmeldungen (automatisch erstellt)
| Zeitstempel | Anlass-ID | Name | E-Mail | Telefon | Anlass |
|-------------|-----------|------|--------|---------|--------|
| 30.11.2024 | 1 | Max Muster | max@mail.ch | 079... | Sommerfest |

---

## 🛠 Anlässe verwalten

Im Google Sheet:
1. Öffnen Sie das Menü **🏰 Schulhelfer**
2. Wählen Sie **Neuer Anlass**
3. Füllen Sie das Formular aus

Oder direkt in der Tabelle "Anlässe":
- Neue Zeile hinzufügen
- ID muss eindeutig sein
- Datum im Format TT.MM.JJJJ

---

## ❓ FAQ

**Wie teile ich das Tool?**  
Senden Sie die GitHub Pages URL per E-Mail an die Eltern.

**Kann ich das Design anpassen?**  
Ja! Ändern Sie die Farben in `css/styles.css` unter `:root`.

**Wie viele Helfer können sich anmelden?**  
Unbegrenzt – das Limit setzen Sie pro Anlass in der Spalte "Benötigte Helfer".

**Werden Daten geschützt?**  
Die Daten liegen in Ihrem Google Sheet. Nur Sie haben Zugriff.

---

## 📄 Lizenz

MIT License – Frei verwendbar für Schulen.

---

**Primarstufe Rittergasse Basel**  
Kindergarten & Primarschule
