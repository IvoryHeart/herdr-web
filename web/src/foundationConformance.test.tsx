// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { FoundationConformanceApp } from "./FoundationConformanceApp";
import { coreSurfaceRegistry } from "./surfaceRegistry";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("Foundation conformance assembly", () => {
  it("keeps the conformance assembly limited to generic navigation and Spaces", async () => {
    expect(coreSurfaceRegistry.list().map(({ id }) => id)).toEqual(["spaces"]);
    expect(coreSurfaceRegistry.get("world")).toBeNull();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(<FoundationConformanceApp />));
    expect(container.querySelector('[data-foundation-surface="spaces"]')).not.toBeNull();
    expect(container.textContent).toContain("Foundation conformance shell");
    expect(container.textContent).not.toMatch(/Office|Pixel/iu);
    await act(async () => root.unmount());
  });
});
