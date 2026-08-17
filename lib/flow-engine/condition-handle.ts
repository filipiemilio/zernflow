export const CONDITION_TRUE_HANDLE = "true";
export const CONDITION_FALSE_HANDLE = "false";

export function normalizeConditionHandle(
  handle: string | null | undefined,
): string | undefined {
  if (handle === "yes") return CONDITION_TRUE_HANDLE;
  if (handle === "no") return CONDITION_FALSE_HANDLE;
  return handle ?? undefined;
}

export function matchesConditionHandle(
  edgeHandle: string | null | undefined,
  resultHandle: string,
): boolean {
  return normalizeConditionHandle(edgeHandle) === resultHandle;
}
