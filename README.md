# Osiris 🌌

**Version:** 0.2.0
**An Open Social Universe**

Osiris is a premium social platform designed to connect people across diverse communities. Share your stories, engage in meaningful discussions, and explore a universe of perspectives on news, politics, entertainment, and more.

> 📚 **Hinweis:** Eine ausführliche Einführung und Anleitung finden Sie in der [TUTORIAL.md](./TUTORIAL.md) Datei.

### ✨ New in Version 0.2.0 (Social Modernization)

- **Premium Social Profiles** 👤: Completely overhauled profile experience with banner covers, interactive post cards, and mutual followers.
- **Modular Storage Architecture** 🏗️: Enhanced stability and maintainability with domain-specific storage layers (Security, Content, Social, Analytics).
- **AI-Powered Interaction** 🤖: Integrated AI Bot for dynamic community engagement and assistance.
- **Zero Layout Shift (ZLS) Strategy** ⚡: Implemented layout-matched skeletons and page transitions for a seamless SPA experience.
- **Hardened Security** 🔒: Advanced image sanitization (EXIF stripping), hardened static serving, and secure session management.

## ✨ Key Features

- **Multi-language Support**: Fully localized interface in English, German, Italian, Spanish, French, and Mandarin (ZH).
- **Role-Based Access Control**: Secure system with User, Admin, and Owner roles with dedicated dashboards.
- **Diverse Communities**: 
  - **Discussions Feed**: Text-based community discussions.
  - **Media Feed**: Image and video-centric browsing experience.
  - **Community Hub**: Create and moderate your own specialized spaces.
- **Advanced Social System**:
  - Interactive Post Cards with real-time like/comment feedback.
  - Mutual Follower insights and activity tracking.
  - Global Notification system for mentions and interactions.
- **Modern UI/UX**:
  - Responsive design with Tailwind CSS and Framer Motion.
  - Glassmorphism effects and curated HSL color palettes.
  - Dark/Light mode support with a professional "Universe Blue" theme.
- **Privacy & Trust**:
  - Secure reporting system with automated moderation rules.
  - IP and Device-based ban systems for robust safety.

## 🚀 Getting Started

### Prerequisites

- Node.js (v18 or higher recommended)
- npm

### Installation

1.  **Install Dependencies**:
    Run the installation script to set up both client and server dependencies.

    ```powershell
    .\scripts\install-deps.bat
    ```

2.  **Start Development Server**:
    This will start both the backend Express server and the frontend Vite development server.
    ```powershell
    .\start-dev.bat
    ```
    Access the app at `http://localhost:5000`.

## 📂 Project Structure (Modular)

- **`client/`**: React frontend application (Vite).
  - `src/components/profile/`: Modularized profile components (Cover, Header, Tabs).
  - `src/pages/`: Feature-organized pages (Auth, Feed, Profile).
- **`server/`**: Express backend application.
  - `storage/`: Domain-driven storage modules (UserStorage, ContentStorage, etc.).
  - `routes/`: Modular API routes.
- **`shared/`**: Shared types and Drizzle schemas.
- **`scripts/`**: Development and maintenance utilities.

## 🛠️ Tech Stack

- **Frontend**: React, TypeScript, Tailwind CSS, Shadcn UI, Framer Motion, Wouter, React Query.
- **Backend**: Node.js, Express, Passport.js, Express-Session.
- **Database**: SQLite (via `better-sqlite3` and `drizzle-orm`).
- **Internationalization**: i18next.

## 📝 Scripts

- `start-dev.bat`: Starts the development environment.
- `scripts/install-deps.bat`: Installs all necessary packages.
- `scripts/db/check-db.bat`: Verifies database integrity.
- `scripts/db/cleanup-db.bat`: Purges temporary state and prepares for migration.
