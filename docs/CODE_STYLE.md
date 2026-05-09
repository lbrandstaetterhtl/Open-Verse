# 📜 Osiris Coding Standards & Style Guide

This document defines the coding standards and architectural patterns for the Osiris (Open-Verse) project.

## 🏗️ Architectural Overview

Osiris follows a modern monolith architecture using a unified TypeScript codebase.
- **Frontend**: React (Vite) + Wouter + Tailwind CSS.
- **Backend**: Node.js (Express) + Drizzle ORM.
- **Shared**: Common schemas and types.

---

## 📝 General TypeScript Standards

- **Strict Mode**: TypeScript strict mode is enabled.
- **Types vs Interfaces**: 
  - Use `interface` for defining object structures (especially props and API responses).
  - Use `type` for unions, intersections, and primitives.
- **Explicit Returns**: Prefer explicit return types for functions, especially in the backend/storage layer.

---

## 🎨 Frontend (React) Standards

### 1. Components
- **Definition**: Use the `function` keyword for components instead of arrow functions.
  ```tsx
  export function MyComponent({ prop }: MyComponentProps) {
    return <div>{prop}</div>;
  }
  ```
- **Naming**: Always use **PascalCase** for component names and their respective files.
- **Props**: Define props using an interface named `{ComponentName}Props`.

### 2. Styling & Layout
- **Tailwind CSS**: Use utility classes for styling. Avoid inline styles unless dynamic values are required.
- **Animations**: Use `framer-motion` for all transitions and interactions to maintain the "weightless" feel.
- **Glassmorphism**: Use the project's standard HSL variables and backdrop-blur utilities.

### 3. State & Data
- **Server State**: Always use TanStack React Query (`useQuery`, `useMutation`).
- **Context**: Reserve React Context for truly global state (Auth, Themes, WebSockets).

---

## ⚙️ Backend (Express) Standards

### 1. Storage Pattern
Osiris uses a Repository/Proxy pattern for database access.
- All operations must be defined in `IStorage` (prefix interfaces with `I`).
- `DatabaseStorage` acts as a facade, delegating to domain-specific storage modules (e.g., `UserStorage`).

### 2. Error Handling
- Use the `globalErrorHandler` middleware.
- Always log significant events using the custom `logger` service with appropriate severity levels.

### 3. Security
- **Input Validation**: Every API request must be validated using a Zod schema from `shared/schema.ts`.
- **CSRF**: State-changing requests must include the `x-csrf-token` header.

---

## 🗃️ Database Standards (Drizzle ORM)

- **Table Naming**: Database tables use `snake_case`.
- **Variable Naming**: TypeScript constants for tables use `camelCase` (e.g., `activityLogs`).
- **Primary Keys**: Always use `serial("id").primaryKey()`.
- **Postgres Compatibility**: Use native Postgres types (e.g., `timestamp`) while maintaining SQLite compatibility through the Drizzle abstraction.

---

## 🚨 Identified Style Deviations

During the code audit, the following inconsistencies were identified:

| Location | Deviation | Recommendation |
| :--- | :--- | :--- |
| **File Names** | Mix of PascalCase (`ProfileHeader.tsx`) and kebab-case (`new-user-dialog.tsx`). | Standardize all React components to **PascalCase**. |
| **Storage Params** | `DatabaseStorage` implementation uses single-letter parameters (`u`, `p`, `c`). | Refactor to use descriptive names (e.g., `user`, `post`) to match the interface. |
| **Schema** | Redundancy between `isAdmin` (bool) and `role` (string) in `users` table. | Deprecate `isAdmin` and migrate logic entirely to `role === 'admin'`. |
| **Variable Plurality** | `posts` vs `activityLogs`. Some are plural, some are not. | Standardize all table constants in `shared/schema.ts` to be plural. |

---

*Lead Developer – Osiris Project* 🚀
