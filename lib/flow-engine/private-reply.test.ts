import { describe, expect, it } from "vitest";
import {
  privateReplyInteractiveFields,
  shouldSendCommentPrivateReply,
} from "./private-reply";

describe("privateReplyInteractiveFields", () => {
  it("includes URL buttons from the first message", () => {
    expect(
      privateReplyInteractiveFields({
        text: "Olá, já vou enviar seu link",
        buttons: [
          { title: "claude", type: "url", url: "https://claude.ai/new" },
        ],
      })
    ).toEqual({
      buttons: [
        { title: "claude", type: "url", url: "https://claude.ai/new" },
      ],
    });
  });

  it("binds postback payloads to server-created session variables", () => {
    expect(
      privateReplyInteractiveFields(
        {
          buttons: [
            { title: "Continuar", type: "postback", payload: "ZF_{{session_id}}" },
          ],
        },
        { session_id: "session-123" },
      ),
    ).toEqual({
      buttons: [
        { title: "Continuar", type: "postback", payload: "ZF_session-123" },
      ],
    });
  });

  it("prefers inline buttons when buttons and quick replies are both configured", () => {
    expect(
      privateReplyInteractiveFields({
        text: "Escolha",
        buttons: [{ title: "Abrir", type: "url", url: "https://example.com" }],
        quickReplies: [{ title: "Sim", payload: "yes" }],
      })
    ).toEqual({
      buttons: [{ title: "Abrir", type: "url", url: "https://example.com" }],
    });
  });
});

describe("shouldSendCommentPrivateReply", () => {
  it("uses the comment private-reply path even when an old DM conversation exists", () => {
    expect(
      shouldSendCommentPrivateReply(
        {
          comment_id: "comment-1",
          post_id: "post-1",
        },
        true,
      ),
    ).toBe(true);
  });

  it("does not send a second private reply for the same comment", () => {
    expect(
      shouldSendCommentPrivateReply({
        comment_id: "comment-1",
        post_id: "post-1",
        private_reply_sent: "true",
      }),
    ).toBe(false);
  });
});
