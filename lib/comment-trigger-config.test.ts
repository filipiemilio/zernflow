import { describe, expect, it } from "vitest";
import { normalizePostIds, selectedChannelId } from "./comment-trigger-config";

describe("comment trigger configuration", () => {
  it("keeps only unique non-empty post IDs", () => {
    expect(normalizePostIds(["post-1", "", "post-1", "post-2", 123])).toEqual([
      "post-1",
      "post-2",
    ]);
  });

  it("accepts a selected channel ID and rejects non-strings", () => {
    expect(selectedChannelId({ channelId: "channel-1" })).toBe("channel-1");
    expect(selectedChannelId({ channelId: 123 })).toBeNull();
  });
});
