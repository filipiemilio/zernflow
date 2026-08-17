import { describe, expect, it } from "vitest";
import { formatPublishError } from "./publish-feedback";

describe("formatPublishError", () => {
  it("preserves every validation detail returned by the publish endpoint", () => {
    expect(
      formatPublishError({
        error: "Flow failed publication safety checks",
        details: ["First validation problem", "Second validation problem"],
      }),
    ).toEqual({
      message: "Flow failed publication safety checks",
      details: ["First validation problem", "Second validation problem"],
    });
  });

  it("uses a useful fallback for malformed or unavailable responses", () => {
    expect(formatPublishError(null)).toEqual({
      message: "Não foi possível publicar o flow.",
      details: [],
    });
    expect(formatPublishError({ error: 500, details: "invalid" })).toEqual({
      message: "Não foi possível publicar o flow.",
      details: [],
    });
  });
});
