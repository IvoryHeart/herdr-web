import { mountFoundationBrowser } from "@herdr-world/foundation";
import "@herdr-world/foundation/styles.css";
import { worldProductAssembly } from "./world/worldAssembly";
import "./world/world.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("missing root element");
}

mountFoundationBrowser(root, worldProductAssembly);
