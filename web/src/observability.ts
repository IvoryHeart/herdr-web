import { fetchWithTimeout } from "./fetchWithTimeout";
import type { BridgeHttpUrl } from "./bridgeApi";

export const OBSERVABILITY_EXTENSION_ID = "observability" as const;
export const OBSERVABILITY_CONTRACT_MAJOR = 1 as const;
export const MAX_OBSERVABILITY_ENVELOPES = 1024;
export const MAX_OBSERVABILITY_PAYLOAD_BYTES = 64 * 1024;
const MAX_OBSERVABILITY_RESPONSE_BYTES = 128 * 1024;
const MAX_OBSERVABILITY_ID_LENGTH = 256;
const MAX_OBSERVABILITY_NAMESPACE_LENGTH = 120;
const MAX_OBSERVABILITY_DATA_DEPTH = 8;
const MAX_OBSERVABILITY_DATA_COLLECTION = 1024;
const MAX_OBSERVABILITY_DATA_STRING_LENGTH = 16 * 1024;
const SENSITIVE_DATA_KEY_FRAGMENTS = [
  "token",
  "credential",
  "password",
  "secret",
  "authorization",
  "connection",
  "private",
] as const;

export type ObservabilityContractVersion = {
  major: number;
  minor: number;
};

export type ObservabilityHealth =
  | "available"
  | "unavailable"
  | "degraded"
  | "offline"
  | "incompatible"
  | "unauthorized";

export type ObservabilitySignal = "traces" | "logs" | "metrics" | "activity";
export type ObservabilityOperation = "snapshot" | "events";
export type ObservabilityTargetKind =
  | "host"
  | "workspace"
  | "tab"
  | "pane"
  | "terminal"
  | "agent_session";

export type ObservabilityCapability = {
  signal: ObservabilitySignal;
  operations: ObservabilityOperation[];
};

export type ObservabilityFreshness = {
  mode: "live" | "polling" | "unknown";
  max_age_ms: number | null;
};

export type ObservabilityDescriptor = {
  extension_id: typeof OBSERVABILITY_EXTENSION_ID;
  contract_version: ObservabilityContractVersion;
  provider_id: string;
  capabilities: ObservabilityCapability[];
  target_scopes: ObservabilityTargetKind[];
  freshness: ObservabilityFreshness;
  health: ObservabilityHealth;
  observed_at: number;
};

export type BridgeObservabilityCapability = {
  version: 1;
  contract_version: ObservabilityContractVersion;
  health: ObservabilityHealth;
};

export type QualifiedObservabilityTarget = {
  bridge_id: string;
  kind: ObservabilityTargetKind;
  native_id: string;
};

export type ObservabilityPayload = {
  namespace: string;
  data: unknown;
};

export type ObservabilityTruncation = {
  reason: "size_limit" | "field_limit" | "retention_limit" | "provider_policy";
  original_bytes?: number | null;
  fields: string[];
};

export type ObservabilityReplayInfo = {
  replayed: boolean;
  gap: boolean;
  cursor?: string | null;
};

export type ObservabilityEnvelope = {
  extension_id: typeof OBSERVABILITY_EXTENSION_ID;
  contract_version: ObservabilityContractVersion;
  provider_id: string;
  target?: QualifiedObservabilityTarget;
  observed_at: number;
  status: ObservabilityHealth;
  payload: ObservabilityPayload;
  truncated?: ObservabilityTruncation;
  sequence?: number;
  replay?: ObservabilityReplayInfo;
};

export type ObservabilityExtensionResponse = {
  descriptor: ObservabilityDescriptor;
  snapshot: {
    sequence: number;
    envelopes: ObservabilityEnvelope[];
  };
};

export type ObservabilityTransportMessage =
  | { type: "event"; event: ObservabilityEnvelope }
  | { type: "resync_required"; reason: string; after_sequence: number | null };

export class ObservabilityContractError extends Error {
  constructor(message = "Observability extension response is malformed") {
    super(message);
    this.name = "ObservabilityContractError";
  }
}

export async function fetchObservabilityDescriptor(
  httpUrl: BridgeHttpUrl,
): Promise<ObservabilityDescriptor> {
  const response = await fetchWithTimeout(httpUrl("/api/extensions/observability"));
  if (!response.ok) {
    throw new Error(`observability descriptor failed: ${response.status}`);
  }
  return parseObservabilityDescriptor(await parseJsonResponse(response));
}

export async function fetchObservabilitySnapshot(
  httpUrl: BridgeHttpUrl,
): Promise<ObservabilityExtensionResponse> {
  const response = await fetchWithTimeout(httpUrl("/api/extensions/observability/snapshot"));
  if (!response.ok) {
    throw new Error(`observability snapshot failed: ${response.status}`);
  }
  return parseObservabilityExtensionResponse(await parseJsonResponse(response));
}

export function parseObservabilityDescriptor(value: unknown): ObservabilityDescriptor {
  const record = requiredRecord(value);
  const descriptor: ObservabilityDescriptor = {
    extension_id: requiredLiteral(record.extension_id, OBSERVABILITY_EXTENSION_ID, "extension_id"),
    contract_version: parseContractVersion(record.contract_version),
    provider_id: safeId(record.provider_id, "provider_id"),
    capabilities: parseCapabilities(record.capabilities),
    target_scopes: parseTargetScopes(record.target_scopes),
    freshness: parseFreshness(record.freshness),
    health: parseHealth(record.health),
    observed_at: safeNonNegativeInteger(record.observed_at, "observed_at"),
  };
  return descriptor;
}

export function parseObservabilityCapability(value: unknown): BridgeObservabilityCapability {
  const record = requiredRecord(value);
  if (record.version !== 1) {
    throw new ObservabilityContractError("Observability bridge capability version is invalid");
  }
  return {
    version: 1,
    contract_version: parseContractVersion(record.contract_version),
    health: parseHealth(record.health),
  };
}

export function parseObservabilityExtensionResponse(
  value: unknown,
): ObservabilityExtensionResponse {
  const record = requiredRecord(value);
  const descriptor = parseObservabilityDescriptor(record.descriptor);
  const snapshotRecord = requiredRecord(record.snapshot);
  const rawEnvelopes = snapshotRecord.envelopes;
  if (!Array.isArray(rawEnvelopes) || rawEnvelopes.length > MAX_OBSERVABILITY_ENVELOPES) {
    throw new ObservabilityContractError("Observability snapshot envelope list is invalid");
  }
  const envelopes = rawEnvelopes.map((envelope) => {
    const parsed = parseObservabilityEnvelope(envelope);
    validateEnvelopeForDescriptor(parsed, descriptor, false);
    return parsed;
  });
  return {
    descriptor,
    snapshot: {
      sequence: safeNonNegativeInteger(snapshotRecord.sequence, "snapshot.sequence"),
      envelopes,
    },
  };
}

export function parseObservabilityEnvelope(value: unknown): ObservabilityEnvelope {
  const record = requiredRecord(value);
  const payloadRecord = requiredRecord(record.payload);
  const namespace = safeId(payloadRecord.namespace, "payload.namespace");
  if (
    namespace.length > MAX_OBSERVABILITY_NAMESPACE_LENGTH ||
    !/^[a-z0-9][a-z0-9_.-]*$/u.test(namespace)
  ) {
    throw new ObservabilityContractError("Observability payload namespace is invalid");
  }
  const data = payloadRecord.data;
  const encodedData = JSON.stringify(data);
  if (encodedData === undefined || encodedData.length > MAX_OBSERVABILITY_PAYLOAD_BYTES) {
    throw new ObservabilityContractError("Observability payload exceeds the browser size limit");
  }
  validatePayloadData(data, 0);
  const target = record.target === undefined ? undefined : parseTarget(record.target);
  const truncated = record.truncated === undefined ? undefined : parseTruncation(record.truncated);
  const replay = record.replay === undefined ? undefined : parseReplay(record.replay);
  const sequence =
    record.sequence === undefined
      ? undefined
      : safePositiveInteger(record.sequence, "sequence");
  return {
    extension_id: requiredLiteral(record.extension_id, OBSERVABILITY_EXTENSION_ID, "extension_id"),
    contract_version: parseContractVersion(record.contract_version),
    provider_id: safeId(record.provider_id, "provider_id"),
    ...(target ? { target } : {}),
    observed_at: safeNonNegativeInteger(record.observed_at, "observed_at"),
    status: parseHealth(record.status),
    payload: { namespace, data },
    ...(truncated ? { truncated } : {}),
    ...(sequence === undefined ? {} : { sequence }),
    ...(replay ? { replay } : {}),
  };
}

export function parseObservabilityTransportMessage(
  value: unknown,
): ObservabilityTransportMessage {
  const record = requiredRecord(value);
  if (record.type === "event") {
    const event = parseObservabilityEnvelope(record.event);
    if (event.sequence === undefined) {
      throw new ObservabilityContractError("Observability event is missing a sequence");
    }
    return { type: "event", event };
  }
  if (record.type === "resync_required") {
    const afterSequence =
      record.after_sequence === null
        ? null
        : safeNonNegativeInteger(record.after_sequence, "after_sequence");
    return {
      type: "resync_required",
      reason: safeId(record.reason, "resync reason"),
      after_sequence: afterSequence,
    };
  }
  throw new ObservabilityContractError("Unknown observability transport message");
}

export function validateEnvelopeForDescriptor(
  envelope: ObservabilityEnvelope,
  descriptor: ObservabilityDescriptor,
  requireSequence: boolean,
) {
  if (
    envelope.provider_id !== descriptor.provider_id ||
    envelope.contract_version.major !== descriptor.contract_version.major
  ) {
    throw new ObservabilityContractError("Observability envelope does not match its descriptor");
  }
  if (envelope.target && !descriptor.target_scopes.includes(envelope.target.kind)) {
    throw new ObservabilityContractError("Observability target is outside advertised scopes");
  }
  if (requireSequence && envelope.sequence === undefined) {
    throw new ObservabilityContractError("Observability event is missing a sequence");
  }
}

async function parseJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.length > MAX_OBSERVABILITY_RESPONSE_BYTES) {
    throw new ObservabilityContractError("Observability response exceeds the browser size limit");
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ObservabilityContractError();
  }
}

function parseContractVersion(value: unknown): ObservabilityContractVersion {
  const record = requiredRecord(value);
  const major = safeNonNegativeInteger(record.major, "contract_version.major");
  const minor = safeNonNegativeInteger(record.minor, "contract_version.minor");
  if (minor > 65_535 || major !== OBSERVABILITY_CONTRACT_MAJOR) {
    throw new ObservabilityContractError(`Observability contract major ${String(major)} is incompatible`);
  }
  return { major, minor };
}

function parseHealth(value: unknown): ObservabilityHealth {
  if (
    value === "available" ||
    value === "unavailable" ||
    value === "degraded" ||
    value === "offline" ||
    value === "incompatible" ||
    value === "unauthorized"
  ) {
    return value;
  }
  throw new ObservabilityContractError("Observability health state is invalid");
}

function parseCapabilities(value: unknown): ObservabilityCapability[] {
  if (!Array.isArray(value) || value.length > 32) {
    throw new ObservabilityContractError("Observability capabilities are invalid");
  }
  const signals = new Set<ObservabilitySignal>();
  return value.map((item) => {
    const record = requiredRecord(item);
    const signal = parseSignal(record.signal);
    if (signals.has(signal)) {
      throw new ObservabilityContractError("Observability descriptor repeats a signal");
    }
    signals.add(signal);
    if (!Array.isArray(record.operations) || record.operations.length === 0 || record.operations.length > 2) {
      throw new ObservabilityContractError("Observability capability operations are invalid");
    }
    const operations = record.operations.map(parseOperation);
    if (new Set(operations).size !== operations.length) {
      throw new ObservabilityContractError("Observability capability repeats an operation");
    }
    return { signal, operations };
  });
}

function parseTargetScopes(value: unknown): ObservabilityTargetKind[] {
  if (!Array.isArray(value) || value.length > 6) {
    throw new ObservabilityContractError("Observability target scopes are invalid");
  }
  const scopes = value.map(parseTargetKind);
  if (new Set(scopes).size !== scopes.length) {
    throw new ObservabilityContractError("Observability descriptor repeats a target scope");
  }
  return scopes;
}

function parseFreshness(value: unknown): ObservabilityFreshness {
  const record = requiredRecord(value);
  if (record.mode !== "live" && record.mode !== "polling" && record.mode !== "unknown") {
    throw new ObservabilityContractError("Observability freshness mode is invalid");
  }
  const maxAge =
    record.max_age_ms === null
      ? null
      : safeNonNegativeInteger(record.max_age_ms, "freshness.max_age_ms");
  return { mode: record.mode, max_age_ms: maxAge };
}

function parseTarget(value: unknown): QualifiedObservabilityTarget {
  const record = requiredRecord(value);
  return {
    bridge_id: safeId(record.bridge_id, "target.bridge_id"),
    kind: parseTargetKind(record.kind),
    native_id: safeId(record.native_id, "target.native_id"),
  };
}

function parseTruncation(value: unknown): ObservabilityTruncation {
  const record = requiredRecord(value);
  if (
    record.reason !== "size_limit" &&
    record.reason !== "field_limit" &&
    record.reason !== "retention_limit" &&
    record.reason !== "provider_policy"
  ) {
    throw new ObservabilityContractError("Observability truncation reason is invalid");
  }
  const fields = record.fields === undefined ? [] : record.fields;
  if (!Array.isArray(fields) || fields.length > 64) {
    throw new ObservabilityContractError("Observability truncation fields are invalid");
  }
  return {
    reason: record.reason,
    original_bytes:
      record.original_bytes === undefined || record.original_bytes === null
        ? record.original_bytes ?? undefined
        : safeNonNegativeInteger(record.original_bytes, "truncated.original_bytes"),
    fields: fields.map((field) => safeId(field, "truncated field")),
  };
}

function parseReplay(value: unknown): ObservabilityReplayInfo {
  const record = requiredRecord(value);
  if (typeof record.replayed !== "boolean" || typeof record.gap !== "boolean") {
    throw new ObservabilityContractError("Observability replay information is invalid");
  }
  return {
    replayed: record.replayed,
    gap: record.gap,
    cursor:
      record.cursor === undefined || record.cursor === null
        ? record.cursor ?? undefined
        : safeId(record.cursor, "replay cursor"),
  };
}

function validatePayloadData(value: unknown, depth: number) {
  if (depth > MAX_OBSERVABILITY_DATA_DEPTH) {
    throw new ObservabilityContractError("Observability payload is nested too deeply");
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_OBSERVABILITY_DATA_COLLECTION) {
      throw new ObservabilityContractError("Observability payload contains too many items");
    }
    value.forEach((item) => validatePayloadData(item, depth + 1));
    return;
  }
  if (isRecord(value)) {
    const fields = Object.entries(value);
    if (fields.length > MAX_OBSERVABILITY_DATA_COLLECTION) {
      throw new ObservabilityContractError("Observability payload contains too many fields");
    }
    for (const [key, field] of fields) {
      const lowered = key.toLowerCase();
      if (SENSITIVE_DATA_KEY_FRAGMENTS.some((fragment) => lowered.includes(fragment))) {
        throw new ObservabilityContractError("Observability payload contains a sensitive field");
      }
      safeId(key, "payload field");
      validatePayloadData(field, depth + 1);
    }
    return;
  }
  if (typeof value === "string" && value.length > MAX_OBSERVABILITY_DATA_STRING_LENGTH) {
    throw new ObservabilityContractError("Observability payload contains an oversized string");
  }
}

function parseSignal(value: unknown): ObservabilitySignal {
  if (value === "traces" || value === "logs" || value === "metrics" || value === "activity") {
    return value;
  }
  throw new ObservabilityContractError("Observability signal is invalid");
}

function parseOperation(value: unknown): ObservabilityOperation {
  if (value === "snapshot" || value === "events") {
    return value;
  }
  throw new ObservabilityContractError("Observability operation is invalid");
}

function parseTargetKind(value: unknown): ObservabilityTargetKind {
  if (
    value === "host" ||
    value === "workspace" ||
    value === "tab" ||
    value === "pane" ||
    value === "terminal" ||
    value === "agent_session"
  ) {
    return value;
  }
  throw new ObservabilityContractError("Observability target kind is invalid");
}

function requiredRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new ObservabilityContractError();
  }
  return value;
}

function requiredLiteral<T extends string>(value: unknown, expected: T, field: string): T {
  if (value !== expected) {
    throw new ObservabilityContractError(`Observability ${field} is invalid`);
  }
  return expected;
}

function safeId(value: unknown, field: string): string {
  if (
    typeof value !== "string" ||
    !value ||
    value.length > MAX_OBSERVABILITY_ID_LENGTH ||
    [...value].some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint <= 0x1f || codePoint === 0x7f;
    })
  ) {
    throw new ObservabilityContractError(`Observability ${field} is invalid`);
  }
  return value;
}

function safeNonNegativeInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new ObservabilityContractError(`Observability ${field} is invalid`);
  }
  return Number(value);
}

function safePositiveInteger(value: unknown, field: string): number {
  const parsed = safeNonNegativeInteger(value, field);
  if (parsed === 0) {
    throw new ObservabilityContractError(`Observability ${field} is invalid`);
  }
  return parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
