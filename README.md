# PureCoffee Social Platform

A modern, full-stack social media application designed for content sharing and community interaction. The platform features distinct feeds for media and discussions, a reputation (Karma) system, real-time messaging, and comprehensive moderation tools.

## 🚀 Features

### Core Social Experience
- **Dual Feed System**: 
  - **Media Feed**: Visual-first stream for images and videos.
  - **Discussion Feed**: Text-focused threads for community conversations.
- **Categorized Content**: Specialized zones for News, Entertainment, and General discussions.
- **Interactions**: Like/Dislike system for posts and comments affecting user reputation (Karma).
- **Rich Comments**: Nested conversations with community moderation (voting).

### User Ecosystem
- **Profiles**: Customizable user profiles with avatars, stats, and post history.
- **Reputation (Karma)**: Gamified user score based on community reception of content.
- **Social Graph**: Follow/Unfollow functionality to curate your feed.
- **Real-time Messaging**: Private chat (WebSocket-powered) for users who follow each other.
- **Notifications**: Real-time alerts for likes, follows, and messages.

### Moderation & Administration
- **Reporting System**: Users can report inappropriate posts, comments, or discussions.
- **Admin Dashboard**: Dedicated interface for admins to review and resolve reports.
- **Content Management**: Admins have the ability to delete posts and ban users if necessary.

## 🛠️ Technology Stack

### Frontend
- **Framework**: [React](https://react.dev/) with [Vite](https://vitejs.dev/)
- **Language**: TypeScript
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) & [Shadcn UI](https://ui.shadcn.com/)
- **Routing**: [wouter](https://github.com/molefrog/wouter)
- **State/Data**: [TanStack Query](https://tanstack.com/query/latest)
- **Forms**: React Hook Form + Zod validation

### Backend
- **Runtime**: Node.js
- **Server**: [Express.js](https://expressjs.com/)
- **Database ORM**: [Drizzle ORM](https://orm.drizzle.team/)
- **Real-time**: Native `ws` (WebSockets)
- **Authentication**: Passport.js (Session-based)
- **File Handling**: Multer (for media uploads)

## 📂 Project Structure

```
├── client/                 # Frontend React Application
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   ├── hooks/          # Custom React hooks (auth, ws, etc.)
│   │   ├── pages/          # Application views (Feed, Profile, Admin)
│   │   └── lib/            # Utilities and configurations
├── server/                 # Backend Node.js Application
│   ├── routes.ts           # API Routes definitions
│   ├── storage.ts          # Database interaction layer
│   ├── auth.ts             # Authentication logic
│   └── index.ts            # Server entry point
├── shared/                 # Shared Types & Schemas (Zod)
└── theme.json              # UI Theme configuration
```

## ⚡ Getting Started

1.  **Install Dependencies**
    ```bash
    npm install
    ```

2.  **Database Setup**
    Ensure your database is configured in `.env` (or use local SQLite fallback if configured).
    ```bash
    npm run db:push
    ```

3.  **Run Development Server**
    Starts both the frontend and backend in development mode.
    ```bash
    npm run dev
    ```
    The application will be available at `http://localhost:5000`.