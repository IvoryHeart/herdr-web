import "@fontsource-variable/geist/wght.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AppShell } from "./AppShell";
import { startNativeControls } from "./native";
import "./styles.css";

startNativeControls();

const root = document.getElementById("root");

if (!root) {
  throw new Error("missing root element");
}

createRoot(root).render(
  <StrictMode>
    <AppShell />
  </StrictMode>,
);
