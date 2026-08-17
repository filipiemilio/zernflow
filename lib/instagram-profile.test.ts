import { describe, expect, it } from "vitest";
import { followerDiagnostic } from "./instagram-profile";

describe("followerDiagnostic", () => {
  it("extracts only safe follower booleans from an Instagram sender", () => {
    expect(
      followerDiagnostic({
        id: "private-id",
        username: "private-user",
        instagramProfile: {
          isFollower: true,
          isFollowing: false,
          followerCount: 123,
        },
      }),
    ).toEqual({ profilePresent: true, isFollower: true, isFollowing: false });
  });

  it("represents a missing optional profile without leaking sender data", () => {
    expect(followerDiagnostic({ id: "private-id" })).toEqual({
      profilePresent: false,
      isFollower: null,
      isFollowing: null,
    });
  });
});
