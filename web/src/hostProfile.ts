export const HOST_PROFILE_SCHEMA_VERSION = 1 as const;
export const MAX_HOST_PROFILE_ID_LENGTH = 128;
export const MAX_HOST_PROFILE_LABEL_LENGTH = 80;

export type HostProfile = {
  schemaVersion: typeof HOST_PROFILE_SCHEMA_VERSION;
  profileId: string;
  label: string;
  baseUrl: string;
  enabled: boolean;
  displayOrder: number;
};

export function normalizeHostProfileId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const id = value.trim();
  if (
    !id ||
    id.length > MAX_HOST_PROFILE_ID_LENGTH ||
    hasControlCharacters(id)
  ) {
    return null;
  }
  return id;
}

export function normalizeHostProfileLabel(value: unknown, fallback: string): string {
  const requested = typeof value === "string" ? value.trim() : "";
  const label = requested || fallback.trim();
  if (!label || hasControlCharacters(label)) {
    throw new Error("Host label must contain display-safe text");
  }
  if ([...label].length > MAX_HOST_PROFILE_LABEL_LENGTH) {
    throw new Error(`Host label must be at most ${MAX_HOST_PROFILE_LABEL_LENGTH} characters`);
  }
  return label;
}

function hasControlCharacters(value: string) {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || codePoint === 0x7f;
  });
}

export function hostProfile(
  profileId: string,
  label: string,
  baseUrl: string,
  enabled: boolean,
  displayOrder: number,
): HostProfile {
  const normalizedId = normalizeHostProfileId(profileId);
  if (!normalizedId) {
    throw new Error("Host profile ID is invalid");
  }
  if (!Number.isSafeInteger(displayOrder) || displayOrder < 0) {
    throw new Error("Host display order must be a non-negative integer");
  }
  return {
    schemaVersion: HOST_PROFILE_SCHEMA_VERSION,
    profileId: normalizedId,
    label: normalizeHostProfileLabel(label, baseUrl),
    baseUrl,
    enabled,
    displayOrder,
  };
}
