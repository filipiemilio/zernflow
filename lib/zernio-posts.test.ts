import { describe, expect, it } from "vitest";
import { normalizeExternalPosts } from "./zernio-posts";

describe("normalizeExternalPosts", () => {
  it("maps recent Instagram posts into safe selector items", () => {
    const result = normalizeExternalPosts([
      {
        platform: "instagram",
        platformPostId: "ig-123",
        platformPostUrl: "https://instagram.com/p/example",
        content: "Uma legenda longa",
        thumbnailUrl: "https://cdn.example.com/thumb.jpg",
        publishedAt: "2026-08-03T19:44:47.000Z",
        mediaType: "video",
      },
    ]);

    expect(result).toEqual([
      {
        id: "ig-123",
        url: "https://instagram.com/p/example",
        caption: "Uma legenda longa",
        thumbnailUrl: "https://cdn.example.com/thumb.jpg",
        publishedAt: "2026-08-03T19:44:47.000Z",
        mediaType: "video",
      },
    ]);
  });

  it("drops entries without a platform post ID", () => {
    expect(normalizeExternalPosts([{ content: "sem id" }])).toEqual([]);
  });
});
