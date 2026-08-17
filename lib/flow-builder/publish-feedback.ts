export interface FormattedPublishError {
  message: string;
  details: string[];
}

export function formatPublishError(payload: unknown): FormattedPublishError {
  const fallback = "Não foi possível publicar o flow.";
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { message: fallback, details: [] };
  }

  const value = payload as Record<string, unknown>;
  const message =
    typeof value.error === "string" && value.error.trim()
      ? value.error
      : fallback;
  const details = Array.isArray(value.details)
    ? value.details.filter(
        (detail): detail is string =>
          typeof detail === "string" && detail.trim().length > 0,
      )
    : [];

  return { message, details };
}
