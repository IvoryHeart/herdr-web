import "@fontsource-variable/geist/wght.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { FoundationConformanceApp } from "./FoundationConformanceApp";
import "./styles.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("missing root element");
}

createRoot(root).render(
  <StrictMode>
    <FoundationConformanceApp />
  </StrictMode>,
);
