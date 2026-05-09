# 🌌 Osiris System Overview

This document provides a comprehensive overview of the security, features, and technical architecture of the Osiris platform.

## 🛡️ Security (Sicherheit)

Osiris is built with a "Security-First" mindset to ensure a safe and private social universe.

### 1. Authentication & Session Management
- **Passport.js**: Utilizes industry-standard Passport.js for local authentication.
- **Session-Based**: Secure session management using `express-session` with encrypted cookies.
- **Password Hashing**: High-entropy hashing using Bcrypt. Includes logic for migrating legacy Scrypt hashes.

### 2. Network & Request Protection
- **CSRF Protection**: Mandatory `x-csrf-token` header for all state-changing operations (POST, PATCH, DELETE).
- **Rate Limiting**: Protection against Brute-Force and DoS attacks via `express-rate-limit`.
- **Helmet.js**: Implements secure HTTP headers (CSP, HSTS, etc.) to prevent XSS and Clickjacking.

### 3. Data Integrity & Content Safety
- **Zod Validation**: Strict schema validation for all incoming API requests (frontend and backend).
- **Image Sanitization**: Automatic stripping of EXIF metadata from uploaded images to protect user privacy.
- **XSS Prevention**: Content sanitization to ensure malicious scripts cannot be executed in the browser.

### 4. Moderation & Access Control
- **RBAC (Role-Based Access Control)**: Granular permissions for `user`, `moderator`, `admin`, and `owner`.
- **Advanced Ban System**: Multi-layered banning capability based on IP addresses, device IDs, and user Karma.
- **Audit Logging**: Every administrative action is logged in an immutable `activity_logs` table.

---

## ✨ Features (Funktionen)

Osiris is designed to be a fluid, interconnected community hub.

### 1. Social Core
- **Multi-Media Feeds**: Support for text, image, and video posts with real-time interaction (likes, comments).
- **Rich Profiles**: Customizable banners, avatars, and bio sections. Mutuality tracking (followers/following).
- **Notifications**: Real-time alerts for mentions, replies, and community updates.

### 2. Community Building
- **Community Hubs**: Users can create and manage their own spaces with custom rules and moderation.
- **Membership Management**: Join, leave, and invite systems for diverse social circles.
- **Moderation Tools**: Built-in reporting system and mod-queues for community owners.

### 3. Interaction & AI
- **Real-time Chat**: Weightless, instant messaging powered by WebSockets.
- **AI Assistant**: Integration with Groq for dynamic community engagement and content assistance.
- **Multi-language**: Native support for English, German, Italian, Spanish, French, and Mandarin.

### 4. Customization
- **Theme Builder**: Advanced HSL-based theme engine allowing users to create their own "Space Aesthetic".
- **Glassmorphism**: A premium UI style that emphasizes transparency and depth.

---

## ⚙️ Technical Architecture (Technik)

A modern, scalable stack designed for high performance and low latency.

### 1. Frontend
- **Framework**: React 18 with TypeScript.
- **Routing**: `wouter` for lightweight, performant client-side navigation.
- **State Management**: TanStack React Query for efficient server-state synchronization.
- **Animations**: Framer Motion for "weightless" transitions and micro-interactions.
- **Styling**: Tailwind CSS with Shadcn UI components.

### 2. Backend
- **Server**: Node.js with Express.
- **Real-time**: `ws` (WebSockets) for low-overhead bi-directional communication.
- **ORM**: Drizzle ORM for type-safe database interactions.
- **Database**: 
  - **Local**: SQLite (`better-sqlite3`) for simple development.
  - **Production**: PostgreSQL compatibility for high-availability deployments.

### 3. DevOps & Deployment
- **Vite**: Modern build tool for rapid development and optimized production bundles.
- **Docker**: Containerized architecture (Dockerfile & docker-compose) for easy server deployment.
- **Modular Storage**: Domain-driven storage layers (User, Content, Social, Security) to maintain a clean codebase.

---

*Documented by Osiris Lead Developer* 🚀
