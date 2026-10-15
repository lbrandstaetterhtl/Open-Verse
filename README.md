# Osiris 🌌

**Version:** 0.2.0
**An Open Social Universe**

Osiris is a premium social platform designed to connect people across diverse communities. Share your stories, engage in meaningful discussions, and explore a universe of perspectives on news, politics, entertainment, and more.

> 📚 Deployment: [DEPLOYMENT.md](./DEPLOYMENT.md) · Sicherheits- & Qualitätsstatus: [SECURITY_AND_QUALITY_AUDIT.md](./SECURITY_AND_QUALITY_AUDIT.md)

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

- Node.js 20+
- PostgreSQL 15+ (easiest via Docker)

### Local development

```bash
npm install
docker run -d --name openverse-dev-db -p 5432:5432 \
  -e POSTGRES_USER=openverse -e POSTGRES_PASSWORD=dev -e POSTGRES_DB=openverse postgres:16-alpine
cp .env.example .env
# in .env: DATABASE_URL=postgres://openverse:dev@localhost:5432/openverse
#          plus SESSION_SECRET and INITIAL_OWNER_* for your first admin
npm run dev
```

Access the app at `http://localhost:5000`. Database migrations in `migrations/` run automatically on startup.

> The SQLite mode (`USE_SQLITE=true`) is currently not usable on a fresh database, see the audit.

### Production

See [DEPLOYMENT.md](./DEPLOYMENT.md) (Docker Compose with PostgreSQL and Nginx).

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
- **Database**: PostgreSQL via `drizzle-orm` (legacy SQLite mode via `better-sqlite3`).
- **Internationalization**: i18next.

## 📝 Scripts

- `npm run dev` – development server with hot reload.
- `npm run build` / `npm start` – production build and start.
- `npm run check` – TypeScript type check.
- `npm run test:e2e` – end-to-end API tests against a running server (see [DEPLOYMENT.md](./DEPLOYMENT.md#-nach-dem-deployment-testen)).
- `npm run knip` – find unused files, exports and dependencies.
- `tests/security/*.ts` – attack simulations (brute force, oversized payloads, upload spoofing, load) against `localhost:5000`.
