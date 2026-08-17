export function normalizePostIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((id): id is string => typeof id === "string" && id.trim().length > 0))];
}

export function selectedChannelId(data: Record<string, unknown>): string | null {
  const value = data.channelId;
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}
