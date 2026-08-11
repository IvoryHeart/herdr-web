import { afterEach, describe, expect, it, vi } from "vitest";
import {
  hasStoredWorldSettings,
  normalizeWorldPrometheusUrl,
  readWorldSettings,
  writeWorldSettings,
} from "./worldSettings";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Office settings", () => {
  it("normalizes an optional Prometheus endpoint without accepting credentials or query state", () => {
    expect(normalizeWorldPrometheusUrl(" http://127.0.0.1:9101 ")).toBe(
      "http://127.0.0.1:9101/",
    );
    expect(normalizeWorldPrometheusUrl("https://metrics.example.test/prometheus")).toBe(
      "https://metrics.example.test/prometheus/",
    );
    expect(normalizeWorldPrometheusUrl("  ")).toBeNull();
    expect(() => normalizeWorldPrometheusUrl("ftp://metrics.example.test")).toThrow(
      /http:\/\/ or https:\/\//iu,
    );
    expect(() => normalizeWorldPrometheusUrl("http://user@metrics.example.test")).toThrow(
      /credentials/iu,
    );
    expect(() => normalizeWorldPrometheusUrl("http://metrics.example.test/?token=secret")).toThrow(
      /query string/iu,
    );
  });

  it("stores Office settings separately for each bridge", () => {
    let value: string | null = null;
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => value),
      setItem: vi.fn((_key: string, next: string) => {
        value = next;
      }),
    });

    expect(hasStoredWorldSettings("bridge-a")).toBe(false);
    writeWorldSettings("bridge-a", { prometheusUrl: "http://127.0.0.1:9101/" });
    writeWorldSettings("bridge-b", { prometheusUrl: null });

    expect(readWorldSettings("bridge-a")).toEqual({ prometheusUrl: "http://127.0.0.1:9101/" });
    expect(readWorldSettings("bridge-b")).toEqual({ prometheusUrl: null });
    expect(hasStoredWorldSettings("bridge-b")).toBe(true);
  });
});
