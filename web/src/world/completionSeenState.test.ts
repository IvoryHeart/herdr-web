import { describe, expect, it, vi } from "vitest";
import {
  readWorldCompletionSeenKeys,
  writeWorldCompletionSeenKeys,
} from "./completionSeenState";

function memoryStorage(initial?: string) {
  let value = initial ?? null;
  return {
    getItem: vi.fn(() => value),
    setItem: vi.fn((_key: string, next: string) => {
      value = next;
    }),
  };
}

describe("world completion seen state", () => {
  it("round-trips acknowledged completion identities", () => {
    const storage = memoryStorage();
    writeWorldCompletionSeenKeys(new Set(["host-a:terminal-1", "host-b:terminal-2"]), storage);

    expect(readWorldCompletionSeenKeys(storage)).toEqual(
      new Set(["host-a:terminal-1", "host-b:terminal-2"]),
    );
    expect(storage.setItem).toHaveBeenCalledOnce();
  });

  it("ignores malformed browser state", () => {
    expect(readWorldCompletionSeenKeys(memoryStorage("not-json"))).toEqual(new Set());
    expect(readWorldCompletionSeenKeys(memoryStorage(JSON.stringify({ key: "value" })))).toEqual(
      new Set(),
    );
  });
});
