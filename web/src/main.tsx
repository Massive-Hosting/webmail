import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./i18n/index.ts";
import "./index.css";
import "./components.css";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Register service worker for notification handling (browser only, not Tauri)
if ("serviceWorker" in navigator && !("__TAURI__" in window)) {
  navigator.serviceWorker.register("/sw.js").catch((err) => {
    console.warn("[sw] Registration failed:", err);
  });
}
