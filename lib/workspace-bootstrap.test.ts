import { describe, expect, it } from "vitest";
import { defaultWorkspaceIdentity } from "./workspace-bootstrap";

describe("defaultWorkspaceIdentity", () => {
  it("creates a stable unique workspace identity for a first-time user", () => {
    expect(
      defaultWorkspaceIdentity({
        id: "12345678-abcd-4abc-9abc-123456789abc",
        email: "filipi@example.com",
        user_metadata: { full_name: "Offgrid Cinema" },
      })
    ).toEqual({
      name: "Offgrid Cinema",
      slug: "offgrid-cinema-12345678",
    });
  });

  it("falls back to the email name when metadata has no name", () => {
    expect(
      defaultWorkspaceIdentity({
        id: "abcdef12-abcd-4abc-9abc-123456789abc",
        email: "filipi@example.com",
        user_metadata: {},
      })
    ).toEqual({
      name: "filipi",
      slug: "filipi-abcdef12",
    });
  });
});
