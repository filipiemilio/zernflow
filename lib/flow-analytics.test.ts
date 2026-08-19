import { describe, expect, it } from "vitest";
import { computeFunnelStages, monitoredPostIds } from "./flow-analytics";

describe("computeFunnelStages", () => {
  it("counts each stage from the session variables the engine already writes", () => {
    const stages = computeFunnelStages([
      // Commented, DM delivered, replied, completed.
      {
        status: "completed",
        variables: { private_reply_sent: "true", comment_text: "texto", message: "Já segui" },
      },
      // Commented, DM delivered, replied, still active (mid-flow).
      {
        status: "active",
        variables: { private_reply_sent: "true", comment_text: "texto", message: "oi" },
      },
      // Commented, DM delivered, never replied — the "não foi na DM" drop-off.
      { status: "active", variables: { private_reply_sent: "true", comment_text: "texto" } },
      // Commented, but the private reply itself never went out (e.g. restricted account).
      { status: "cancelled", variables: { comment_text: "texto" } },
    ]);

    const byKey = Object.fromEntries(stages.map((s) => [s.key, s]));
    expect(byKey.entered).toMatchObject({ count: 4, pct: 100 });
    expect(byKey.dmDelivered).toMatchObject({ count: 3, pct: 75 });
    expect(byKey.engaged).toMatchObject({ count: 2, pct: 50 });
    expect(byKey.completed).toMatchObject({ count: 1, pct: 25 });
  });

  it("does not count the untouched engine default as a reply", () => {
    // engine.ts runs `variables.message ??= incomingMessage.text` on every
    // session's first node, so a contact who never replied still has
    // variables.message — identical to comment_text, since nothing
    // overwrote it. A naive "message is set" check counted this as engaged
    // and, against production data, made "replied" outnumber "DM delivered",
    // which is impossible.
    const stages = computeFunnelStages([
      { status: "cancelled", variables: { comment_text: "Texto", message: "Texto" } },
    ]);
    expect(stages.find((s) => s.key === "engaged")?.count).toBe(0);
  });

  it("counts a reply when the message differs from the triggering comment", () => {
    const stages = computeFunnelStages([
      { status: "active", variables: { comment_text: "Texto", message: "link" } },
    ]);
    expect(stages.find((s) => s.key === "engaged")?.count).toBe(1);
  });

  it("falls back to presence when there is no comment_text to compare against", () => {
    const stages = computeFunnelStages([{ status: "active", variables: { message: "oi" } }]);
    expect(stages.find((s) => s.key === "engaged")?.count).toBe(1);
  });

  it("treats a blank or whitespace-only reply as not engaged", () => {
    const stages = computeFunnelStages([
      { status: "active", variables: { message: "   " } },
      { status: "active", variables: { message: "" } },
    ]);
    expect(stages.find((s) => s.key === "engaged")?.count).toBe(0);
  });

  it("returns all-zero stages at 0% instead of dividing by zero on an empty flow", () => {
    const stages = computeFunnelStages([]);
    expect(stages.every((s) => s.count === 0 && s.pct === 0)).toBe(true);
  });

  it("stage order matches the funnel's left-to-right sequence", () => {
    expect(computeFunnelStages([]).map((s) => s.key)).toEqual([
      "entered",
      "dmDelivered",
      "engaged",
      "completed",
    ]);
  });
});

describe("monitoredPostIds", () => {
  it("collects the post ids a comment trigger is scoped to", () => {
    expect(
      monitoredPostIds([
        { data: { triggerType: "comment_keyword", postScope: "specific", postIds: ["a", "b"] } },
        { data: { triggerType: "sendMessage" } },
      ]),
    ).toEqual(["a", "b"]);
  });

  it("returns nothing when the trigger listens to every post", () => {
    // Without specific posts there is no single view count to report, so the
    // card offers nothing rather than summing an unrelated total.
    expect(
      monitoredPostIds([{ data: { triggerType: "comment_keyword", postScope: "all" } }]),
    ).toEqual([]);
  });

  it("ignores non-comment triggers and malformed data", () => {
    expect(monitoredPostIds([{ data: { triggerType: "keyword", postIds: ["a"] } }])).toEqual([]);
    expect(monitoredPostIds(null)).toEqual([]);
    expect(monitoredPostIds([{}])).toEqual([]);
  });

  it("de-duplicates ids shared by more than one trigger", () => {
    expect(
      monitoredPostIds([
        { data: { triggerType: "comment_keyword", postScope: "specific", postIds: ["a"] } },
        { data: { triggerType: "comment_keyword", postScope: "specific", postIds: ["a", "b"] } },
      ]),
    ).toEqual(["a", "b"]);
  });
});
