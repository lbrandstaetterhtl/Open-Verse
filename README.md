# PureCoffee ☕
> Version 0.2.0

## ✨ Key Features

*   **Multi-language Support**: Fully localized interface in English, German, Italian, Spanish, French, and Mandarin (ZH).
*   **Role-Based Access Control**: Secure system with User, Admin, and Owner roles.
*   **Dynamic Feeds**:
    *   **Media Feed**: Share images and videos for News and Entertainment.
    *   **Discussions Feed**: Text-based community discussions.
*   **Interactive Community**:
    *   Like, Comment, and Reply to posts.
    *   Follow/Unfollow users.
    *   User Profiles with activity history.
*   **Admin Dashboard**: Comprehensive tools for user management, role assignment, and report handling.
*   **Modern UI/UX**:
    *   Responsive design for Mobile and Desktop.
    *   Dark/Light mode support.
*   **Security**:
    *   Secure reporting system with predefined reasons.
    *   Moderation tools for Admins and Owners.

## 🚀 Getting Started

### Prerequisites
*   Node.js (v18 or higher recommended)
*   npm

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
    Access the app at `http://localhost:5007`.

## 📂 Project Structure

*   **`client/`**: React frontend application (Vite).
    *   `src/components/`: Reusable UI components (Dialogs, Theme, etc.).
    *   `src/pages/`: Application pages organized by feature (Auth, Feed, Profile, etc.).
    *   `public/locales/`: Translation files.
*   **`server/`**: Express backend application.
    *   `routes.ts`: API route definitions.
    *   `storage.ts`: Database interaction layer.
*   **`scripts/`**: Utility scripts for development and maintenance.
    *   `db/`: Database management scripts (`check-db`, `cleanup-db`, etc.).
*   **`docs/`**: Project documentation and notes.

## 🛠️ Tech Stack

*   **Frontend**: React, TypeScript, Tailwind CSS, Shadcn UI, Wouter (Routing), React Query.
*   **Backend**: Node.js, Express, Passport.js (Auth).
*   **Database**: SQLite (via `better-sqlite3` and `drizzle-orm`).
*   **Internationalization**: i18next.

## 📝 Scripts

*   `start-dev.bat`: Starts the development environment.
*   `scripts/install-deps.bat`: Installs all necessary packages.
*   `scripts/cleanup.bat`: Cleans up node_modules and reinstall.
*   `scripts/db/check-db.bat`: Verifies database integrity.
