import { describe, expect, it } from "vitest";
import { followerConditionValue } from "./follower-condition";

describe("followerConditionValue", () => {
  it("returns the current sender follower status", () => {
    expect(
      followerConditionValue({
        sender: { instagramProfile: { isFollower: true } },
      }),
    ).toBe("true");
    expect(
      followerConditionValue({
        sender: { instagramProfile: { isFollower: false } },
      }),
    ).toBe("false");
  });

  it("falls back to the status persisted by a delayed resume", () => {
    expect(
      followerConditionValue({ sender: { id: "sender" } }, "true"),
    ).toBe("true");
    expect(
      followerConditionValue(
        { sender: { instagramProfile: { isFollower: false } } },
        "true",
      ),
    ).toBe("false");
  });

  it("prefers a live conversation lookup over a stale webhook snapshot", () => {
    expect(
      followerConditionValue(
        { sender: { instagramProfile: { isFollower: false } } },
        "false",
        true,
      ),
    ).toBe("true");
  });

  it("returns undefined when Instagram profile data is unavailable", () => {
    expect(followerConditionValue({ sender: { id: "sender" } })).toBeUndefined();
  });
});
