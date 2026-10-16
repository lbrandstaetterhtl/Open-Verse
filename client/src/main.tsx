import { Suspense } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "./lib/i18n";
import { applyColorScheme, applyStoredTheme } from "./lib/theme-utils";

// Apply light/dark mode and the stored theme before the first render, so a reload never shows the
// default colours first and then switches.
applyColorScheme();
applyStoredTheme();

// useTranslation() suspends until the translation files are loaded. Components outside the route-level
// Suspense boundaries (layout, dialogs, toaster) can render before that, e.g. when the login check returns
// first. Without a boundary here React throws error #426 and unmounts the whole app (blank page).
createRoot(document.querySelector("#root")!).render(
  <Suspense fallback={null}>
    <App />
  </Suspense>,
);
