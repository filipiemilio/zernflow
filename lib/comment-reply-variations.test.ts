import { describe, expect, it } from "vitest";
import { selectCommentReplyVariation } from "./comment-reply-variations";

describe("selectCommentReplyVariation", () => {
  it("selects one configured public-reply variation using the supplied random value", () => {
    const replies = ["Confira sua DM!", "Acabei de enviar no direct.", "Mensagem enviada ✅"];

    expect(selectCommentReplyVariation({ replyTexts: replies }, () => 0)).toBe(replies[0]);
    expect(selectCommentReplyVariation({ replyTexts: replies }, () => 0.4)).toBe(replies[1]);
    expect(selectCommentReplyVariation({ replyTexts: replies }, () => 0.99)).toBe(replies[2]);
  });

  it("ignores blank variations and supports legacy single replyText rules", () => {
    expect(
      selectCommentReplyVariation({ replyTexts: ["  ", " Veja suas DMs! "] }, () => 0),
    ).toBe("Veja suas DMs!");
    expect(selectCommentReplyVariation({ replyText: "Mensagem enviada" })).toBe(
      "Mensagem enviada",
    );
  });
});
