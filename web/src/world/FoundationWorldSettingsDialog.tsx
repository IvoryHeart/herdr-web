import { CheckCircle2, CircleOff } from "lucide-react";
import { useEffect, useState } from "react";
import type { SurfaceHostV1 } from "@herdr-world/foundation/surfaces";
import {
  hasStoredWorldSettings,
  normalizeWorldPrometheusUrl,
  readWorldLongRoomTitleMode,
  readWorldRoomAlignment,
  readWorldSettings,
  writeWorldLayoutSettings,
  writeWorldSettings,
} from "./worldSettingsState";
import type { WorldObservabilityConfiguration } from "./worldSettingsState";
import type { OfficeLongRoomTitleMode, OfficeRoomAlignment } from "./officeGeometry";

export function FoundationWorldSettingsDialog({
  context,
  onClose,
  onSaved,
}: {
  context: { host: SurfaceHostV1 };
  onClose: () => void;
  onSaved?: () => void;
}) {
  const { host } = context;
  const [, setHostRevision] = useState(0);
  const bridgeIds = host.runtimes.map(({ identity }) => identity.bridgeId);
  const bridgeIdsKey = JSON.stringify(bridgeIds);
  const [selectedBridgeId, setSelectedBridgeId] = useState(
    () => host.selectedRuntime?.identity.bridgeId ?? bridgeIds[0] ?? null,
  );
  const [prometheusUrl, setPrometheusUrl] = useState("");
  const [roomAlignment, setRoomAlignment] = useState<OfficeRoomAlignment>(readWorldRoomAlignment);
  const [longRoomTitleMode, setLongRoomTitleMode] = useState<OfficeLongRoomTitleMode>(
    readWorldLongRoomTitleMode,
  );
  const [configuration, setConfiguration] = useState<WorldObservabilityConfiguration | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const update = () => setHostRevision((revision) => revision + 1);
    const unsubscribeFacts = host.facts.subscribe(update);
    const unsubscribeSelection = host.subscribeSelectedRuntime(update);
    return () => {
      unsubscribeFacts();
      unsubscribeSelection();
    };
  }, [host]);

  useEffect(() => {
    const currentBridgeIds = host.runtimes.map(({ identity }) => identity.bridgeId);
    if (selectedBridgeId && currentBridgeIds.includes(selectedBridgeId)) {
      return;
    }
    setSelectedBridgeId(host.selectedRuntime?.identity.bridgeId ?? currentBridgeIds[0] ?? null);
  }, [bridgeIdsKey, host, selectedBridgeId]);

  const runtime = host.runtimes.find(({ identity }) => identity.bridgeId === selectedBridgeId) ?? null;
  const observabilityAvailable = Boolean(
    runtime?.features.includes("observability_extension"),
  );
  const runtimeKey = JSON.stringify(runtime
    ? {
        identity: runtime.identity,
        observability: runtime.features.includes("observability_extension"),
      }
    : null);

  useEffect(() => {
    const currentRuntime = selectedBridgeId
      ? host.runtimes.find(({ identity }) => identity.bridgeId === selectedBridgeId) ?? null
      : null;
    if (!currentRuntime) {
      setPrometheusUrl("");
      setConfiguration(null);
      setLoading(false);
      return;
    }
    const stored = hasStoredWorldSettings(currentRuntime.identity.bridgeId)
      ? readWorldSettings(currentRuntime.identity.bridgeId)
      : null;
    if (stored) {
      setPrometheusUrl(stored.prometheusUrl ?? "");
    }
    if (!currentRuntime.features.includes("observability_extension")) {
      if (!stored) setPrometheusUrl("");
      setConfiguration(null);
      setLoading(false);
      setMessage(null);
      return;
    }
    let disposed = false;
    setLoading(true);
    setMessage(null);
    void host.extensions.request({
      runtime: currentRuntime.identity,
      extensionId: "observability",
      operation: "config-read",
    })
      .then((value) => {
        if (disposed) return;
        const next = parseConfiguration(value);
        setConfiguration(next);
        if (!stored) setPrometheusUrl(next.endpoint ?? "");
      })
      .catch((error: unknown) => {
        if (!disposed) {
          setMessage(error instanceof Error ? error.message : "Could not load Office settings");
        }
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });
    return () => {
      disposed = true;
    };
  }, [host, runtimeKey, selectedBridgeId]);

  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      let normalized: string | null = null;
      if (runtime && observabilityAvailable) {
        normalized = normalizeWorldPrometheusUrl(prometheusUrl);
        const value = await host.extensions.request({
          runtime: runtime.identity,
          extensionId: "observability",
          operation: "config-update",
          body: { prometheus_url: normalized },
        });
        const next = parseConfiguration(value);
        writeWorldSettings(runtime.identity.bridgeId, { prometheusUrl: normalized });
        setPrometheusUrl(next.endpoint ?? "");
        setConfiguration(next);
      }
      writeWorldLayoutSettings({ roomAlignment, longRoomTitleMode });
      window.dispatchEvent(new Event("herdr-world-settings-updated"));
      onSaved?.();
      setMessage(runtime && observabilityAvailable
        ? normalized ? "Prometheus URL saved." : "Prometheus provider disabled."
        : "Office layout saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save Office settings");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="world-settings-form"
      aria-label="Office settings configuration"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
        <div className="world-settings-content">
          <div className="settings-label">Office host</div>
          {bridgeIds.length > 0 ? (
            <label className="field-label">
              <span>Bridge</span>
              <select
                className="field"
                value={selectedBridgeId ?? ""}
                onChange={(event) => setSelectedBridgeId(event.target.value)}
              >
                {bridgeIds.map((bridgeId) => {
                  const item = host.runtimes.find(({ identity }) => identity.bridgeId === bridgeId);
                  return <option key={bridgeId} value={bridgeId}>{item?.label ?? bridgeId}</option>;
                })}
              </select>
            </label>
          ) : (
            <div className="backend-static">Enable a connected bridge to configure Office.</div>
          )}
          <div className="settings-label">Observability provider</div>
          <p className="settings-help">
            Optional Prometheus URL used by the World bridge to populate the Economy board. Office
            sessions and terminals work without it. The browser never queries Prometheus directly.
          </p>
          <label className="field-label">
            <span>Prometheus URL</span>
            <input
              className="field"
              value={prometheusUrl}
              placeholder="http://127.0.0.1:9101"
              autoComplete="off"
              spellCheck={false}
              disabled={!runtime || !observabilityAvailable || loading || busy}
              onChange={(event) => setPrometheusUrl(event.target.value)}
            />
          </label>
          <label className="field-label">
            <span>Long room titles</span>
            <select
              className="field"
              value={longRoomTitleMode}
              disabled={busy}
              onChange={(event) => setLongRoomTitleMode(event.target.value as OfficeLongRoomTitleMode)}
            >
              <option value="expand">Expand long room titles</option>
              <option value="compact">Compact long room titles</option>
            </select>
          </label>
          <div className="world-settings-health" data-status={configuration?.configured ? "available" : "unavailable"}>
            {configuration?.configured ? <CheckCircle2 size={14} /> : <CircleOff size={14} />}
            <span>
              {loading
                ? "Loading provider configuration…"
                : runtime && !observabilityAvailable
                  ? "Observability is unavailable on this bridge"
                : configuration?.configured
                  ? `Configured: ${configuration.providerId}`
                  : "Not configured; Economy will show no data"}
            </span>
          </div>
          <div className="settings-label">Office layout</div>
          <p className="settings-help">
            Choose how room rows align inside the Office scene. This affects rooms only; the CEO
            Office and Agent Bar keep their dedicated positions.
          </p>
          <label className="field-label">
            <span>Room alignment</span>
            <select
              className="field"
              value={roomAlignment}
              disabled={busy}
              onChange={(event) => setRoomAlignment(event.target.value as OfficeRoomAlignment)}
            >
              <option value="left">Left</option>
              <option value="center">Center</option>
              <option value="right">Right</option>
            </select>
          </label>
          {message ? <div className="modal-message">{message}</div> : null}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy || loading}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
    </form>
  );
}

function parseConfiguration(value: unknown): WorldObservabilityConfiguration {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Observability settings response is malformed");
  }
  const record = value as Record<string, unknown>;
  if (
    typeof record.provider_id !== "string" ||
    typeof record.configured !== "boolean" ||
    (record.endpoint !== null && typeof record.endpoint !== "string")
  ) {
    throw new Error("Observability settings response is malformed");
  }
  return {
    providerId: record.provider_id,
    configured: record.configured,
    endpoint: record.endpoint,
  };
}
