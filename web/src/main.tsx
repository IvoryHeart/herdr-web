import "@fontsource-variable/geist/wght.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { startNativeControls } from "./native";
import { WorldFoundationRoot } from "./world/worldAssembly";
import "@herdr-world/foundation/styles.css";
import "./world/styles.css";

startNativeControls();

const root = document.getElementById("root");

if (!root) {
  throw new Error("missing root element");
}

createRoot(root).render(
  <StrictMode>
    <WorldFoundationRoot />
  </StrictMode>,
);
