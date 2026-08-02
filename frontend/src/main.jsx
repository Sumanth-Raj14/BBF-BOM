// Blackbox BOM — Vite entry point
// Migration in progress: files are being converted from window.* globals to ES module imports.
// Import api.js or globals.js named exports directly (new pattern); legacy files still use side-effect imports + window.* shims.
// See src/globals.js for the central re-export hub with all named exports.

import React from "react";
import ReactDOM from "react-dom";

// i18n — must be imported before any component that uses translations
import "./i18n.js";

// Named imports from globals.js demonstrate the new ES module pattern
import { storage } from "./utils/storage.js";

// Improvement #2: `window.__t = __t` is gone. Every module that calls __t()
// imports it from ./i18n.js, so the shim had no readers left.
//
// window.__changeLang stays deliberately: there is no language-switcher UI,
// so this console hook is the only way to change language at runtime. Remove
// it when a real switcher lands.
import i18n from "./i18n.js";
window.__changeLang = (lng) => {
  i18n.changeLanguage(lng);
  storage.lang.set(lng);
  window.location.reload();
};

// Make React/ReactDOM available globally (needed by components using window.React)
window.React = React;
window.ReactDOM = ReactDOM;

// Data layer (plain JS, no JSX) — still using window.* pattern
import "../api.js";
import "../data.js";
import "../projects.js";
import "../cloud-sync.js";

// Core UI components (order matters — later files depend on earlier globals)
import "./root/icons.jsx";
import "./root/tweaks-panel.jsx";
import "./root/overlays.jsx";

// Modals and overlays (depend on Modal, Toast, useAppStore from overlays)
import "./root/modals-extra.jsx";
import "./root/advanced-features.jsx";
import "./root/pdm-cad.jsx";
import "./root/auth-onboarding.jsx";
import "./root/prod-additions.jsx";
import "./root/final-polish.jsx";

// Real-time collaboration (WebSocket presence, cursors, typing, locking)
import "./root/collaboration.jsx";

// Enterprise utilities (ErrorBoundary, Skeleton, needed before screens)
import "./root/enterprise-utils.jsx";

import "./root/detail-drawer.jsx";

// App shell (last — defines window.App and mounts itself via createRoot)
import "./root/app.jsx";

// Register new professional loading/error/empty state components
import "./components/register-components.js";

// Shared UI primitives layer (token-only .ui-* components + ui.css).
// Exposes window.UI for legacy window.* screens during migration.
import "./components/ui/index.js";

// Global error handler.
// Improvement #2: these used to be gated on `window.toast`, a global nothing
// ever assigned — so neither branch could run. Toasts now come from
// utils/toast.js; here we just log.
window.addEventListener("error", (e) => {
  if (!e.defaultPrevented) console.warn("Uncaught error:", e.error || e.message);
});
window.addEventListener("unhandledrejection", (e) => {
  console.warn("Unhandled rejection:", e.reason);
});

// Register service worker (production only)
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // SW registration failed — app still works without it
    });
  });
}
