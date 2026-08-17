export interface CommentReplyConfig {
  replyText?: string;
  replyTexts?: string[];
}

export function commentReplyVariations(config: CommentReplyConfig): string[] {
  const variations = (config.replyTexts ?? [])
    .filter((text): text is string => typeof text === "string")
    .map((text) => text.trim())
    .filter(Boolean);

  if (variations.length > 0) return variations;

  const legacyReply = config.replyText?.trim();
  return legacyReply ? [legacyReply] : [];
}

export function selectCommentReplyVariation(
  config: CommentReplyConfig,
  random: () => number = Math.random,
): string | undefined {
  const variations = commentReplyVariations(config);
  if (variations.length === 0) return undefined;
  return variations[Math.min(Math.floor(random() * variations.length), variations.length - 1)];
}
