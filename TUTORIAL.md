# Projekt-Dokumentation: Osiris Social Platform

## 1. Projektübersicht

Osiris (interner Projektname: open-verse) ist eine soziale Plattform ("Open Social Universe"), die Benutzern ermöglicht, Geschichten zu teilen, Medien hochzuladen und sich über verschiedene Communities hinweg zu verbinden.

### Technologie-Stack

*   **Frontend:** React (TypeScript), Vite, Tailwind CSS, Shadcn UI, React Query
*   **Backend:** Node.js, Express, Passport.js (Authentifizierung)
*   **Datenbank:** PostgreSQL (via Neon) oder SQLite (lokal), verwaltet mit Drizzle ORM
*   **Sprache:** TypeScript (Fullstack)

## 2. Installation und Einrichtung

### Voraussetzungen

*   Node.js (Version 20 oder höher empfohlen)
*   npm (Node Package Manager)

### Schritt-für-Schritt Installation

1.  **Repository klonen oder entpacken:**
    Stellen Sie sicher, dass Sie sich im Projektverzeichnis befinden (`PureCoffee-dev-`).

2.  **Abhängigkeiten installieren:**
    Führen Sie den folgenden Befehl im Terminal aus, um alle notwendigen Pakete herunterzuladen:
    ```bash
    npm install
    ```

3.  **Umgebungsvariablen konfigurieren:**
    Das Projekt benötigt eine `.env` Datei im Hauptverzeichnis. Eine Vorlage sollte vorhanden sein. Wichtige Variablen:
    *   `SESSION_SECRET`: Ein geheimer Schlüssel für Session-Cookies.
    *   `USE_SQLITE`: Setzen Sie dies auf `true` für lokale Entwicklung ohne PostgreSQL.
    *   `DATABASE_URL`: Falls PostgreSQL verwendet wird.

4.  **Datenbank einrichten:**
    Um das Datenbankschema zu erstellen (Tabellen für Benutzer, Posts, Themes etc.), führen Sie aus:
    ```bash
    npm run db:push
    ```
    Dies synchronisiert das Drizzle-Schema (`shared/schema.ts`) mit der Datenbank.

## 3. Entwicklungsumgebung

### Server starten

Um die Anwendung im Entwicklungsmodus zu starten (Frontend und Backend gleichzeitig via Vite Proxy):

```bash
npm run dev
```

Der Server ist standardmäßig unter `http://localhost:5000` erreichbar. Änderungen am Code werden automatisch neu geladen (Hot Module Replacement).

### Projektstruktur

Die Codebasis ist in drei Hauptbereiche unterteilt:

*   **`client/`**: Enthält den React-Frontend-Code.
    *   `src/pages/`: Die verschiedenen Ansichten (Feed, Profil, Admin, Theme Builder).
    *   `src/components/`: Wiederverwendbare UI-Komponenten.
    *   `src/hooks/`: Custom React Hooks (z.B. `use-custom-theme.ts`, `use-auth.tsx`).
    *   `src/lib/`: Hilfsfunktionen (`theme-utils.ts`, `api.ts`).

*   **`server/`**: Enthält den Backend-Code.
    *   `index.ts`: Einstiegspunkt, Server-Setup.
    *   `routes.ts`: API-Endpunkte (REST).
    *   `auth.ts`: Authentifizierungslogik.
    *   `storage.ts`: Datenbank-Abstraktionsschicht.

*   **`shared/`**: Code, der von Client und Server geteilt wird.
    *   `schema.ts`: Drizzle Datenbank-Schema und Zod Validierungs-Typen.

## 4. Kernfunktionen und Technische Details

### Authentifizierung
Das System nutzt `passport-local` für Benutzername/Passwort-Login. Sessions werden serverseitig gespeichert (MemoryStore oder Datenbank).

### Theme-System (Theme Builder)
Ein zentrales Feature ist der Theme Builder, der es Benutzern erlaubt, das Aussehen der Anwendung komplett anzupassen.
*   **Technische Umsetzung:** CSS Variablen und Tailwind.
*   **Persistenz:** Themes werden in der Datenbank gespeichert (`themes` Tabelle).
*   **Logik:** Der Hook `use-custom-theme.ts` verwaltet das Laden, Speichern und Anwenden von Themes. Es gibt eine komplexe Synchronisation zwischen lokalem State (Vorschau) und Datenbank, um Datenkonsistenz sicherzustellen.
*   **Funktionen:** Benutzer können Farben für Light/Dark Mode definieren, Fonts wählen und Einstellungen exportieren/importieren.

### Feed und Medien
Benutzer können Text-Posts und Medien (Bilder, Videos) erstellen.
*   **Uploads:** Werden via `multer` Middleware verarbeitet und im `uploads/` Verzeichnis gespeichert.
*   **Datenabruf:** React Query (`useQuery`) wird für effizientes Caching und Laden der Feed-Daten verwendet.

### Admin Dashboard
Ein geschützter Bereich für Administratoren zur Verwaltung von Benutzern und Inhalten. Zugriff erfordert die Rolle `admin`.

## 5. Deployment

Für den produktiven Einsatz wird der Code optimiert und gebündelt:

```bash
npm run build
npm run start
```

*   `npm run build`: Erstellt das Frontend-Bundle (in `dist/public`) und transpiliert den Server-Code.
*   `npm run start`: Startet den optimierten Node.js Server.

---
Dokumentation erstellt am: 18.01.2026
