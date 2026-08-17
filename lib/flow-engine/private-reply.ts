interface PrivateReplyButton {
  title: string;
  type: "url" | "postback";
  url?: string;
  payload?: string;
}

interface PrivateReplyQuickReply {
  title: string;
  payload: string;
  imageUrl?: string;
}

interface InteractiveMessage {
  text?: string;
  buttons?: PrivateReplyButton[];
  quickReplies?: PrivateReplyQuickReply[];
}

function interpolate(value: string | undefined, variables: Record<string, string>): string | undefined {
  return value?.replace(/\{\{(\w+)\}\}/g, (token, name: string) => variables[name] ?? token);
}

export function shouldSendCommentPrivateReply(
  variables: Record<string, string> = {},
  _hasExistingConversation = false,
): boolean {
  return Boolean(
    variables.comment_id &&
      variables.post_id &&
      variables.private_reply_sent !== "true",
  );
}

export function privateReplyInteractiveFields(
  message: InteractiveMessage,
  variables: Record<string, string> = {},
) {
  const buttons = (message.buttons ?? []).slice(0, 3).map((button) => ({
    ...button,
    ...(button.url ? { url: interpolate(button.url, variables) } : {}),
    ...(button.payload ? { payload: interpolate(button.payload, variables) } : {}),
  }));
  if (buttons.length > 0) return { buttons };

  const quickReplies = (message.quickReplies ?? []).slice(0, 13).map((reply) => ({
    ...reply,
    payload: interpolate(reply.payload, variables) ?? reply.payload,
  }));
  if (quickReplies.length > 0) return { quickReplies };

  return {};
}
