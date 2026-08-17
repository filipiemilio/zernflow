import { describe, expect, it } from "vitest";
import { matchesWaitingSessionInput } from "./session-input";

const node = {
  id: "wait",
  type: "action",
  data: {
    actionType: "smartDelay",
    expectedPayload: "ZF_CONTINUE_{{session_id}}",
    acceptedText: ["link"],
  },
};

const session = {
  id: "session-123",
  current_node_id: "wait",
  variables: { session_id: "session-123" },
};

describe("waiting-session input correlation", () => {
  it("accepts the one session-bound postback payload", () => {
    expect(
      matchesWaitingSessionInput(session, [node], {
        postbackPayload: "ZF_CONTINUE_session-123",
      }),
    ).toBe(true);
  });

  it("rejects payloads from another or older session", () => {
    expect(
      matchesWaitingSessionInput(session, [node], {
        postbackPayload: "ZF_CONTINUE_session-old",
      }),
    ).toBe(false);
  });

  it("accepts an explicitly configured text fallback case-insensitively", () => {
    expect(matchesWaitingSessionInput(session, [node], { text: "  LINK! " })).toBe(true);
  });

  it("does not let arbitrary text consume a payload-bound wait", () => {
    expect(matchesWaitingSessionInput(session, [node], { text: "hello" })).toBe(false);
  });

  it("fails closed if the waiting node no longer exists", () => {
    expect(matchesWaitingSessionInput(session, [], { text: "LINK" })).toBe(false);
  });
});
