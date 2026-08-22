import { createContext } from "react";
import type { SurfaceHostV1 } from "@herdr-world/foundation/surfaces";

export const SurfaceHostContext = createContext<
  Pick<SurfaceHostV1, "acquireTerminal"> | null
>(null);
