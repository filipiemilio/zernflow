export interface FollowerConditionInput {
  sender?: {
    id?: string;
    instagramProfile?: {
      isFollower?: boolean | null;
    } | null;
  };
}

/**
 * Returns the fresh follower value supplied with the current Instagram
 * message. Missing profile data is deliberately represented as undefined;
 * callers must not treat an unavailable value as proof of following.
 */
export function followerConditionValue(
  input: FollowerConditionInput,
  persistedValue?: string,
  liveConversationValue?: boolean,
): string | undefined {
  if (typeof liveConversationValue === "boolean") {
    return String(liveConversationValue);
  }
  const value = input.sender?.instagramProfile?.isFollower;
  if (typeof value === "boolean") return String(value);
  return persistedValue === "true" || persistedValue === "false"
    ? persistedValue
    : undefined;
}
