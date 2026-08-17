import { describe, expect, it } from "vitest";
import {
  isOptInText,
  isOptOutText,
  isPrivateReplyEligible,
  isStandardMessagingWindowOpen,
  validateOutboundHttpUrl,
} from "./automation-safety";

const NOW = new Date("2026-08-04T12:00:00.000Z");

describe("mandatory opt-out commands", () => {
  it.each(["STOP", " stop! ", "unsubscribe", "CANCEL", "sair", "PARAR", "cancelar"])(
    "recognizes %s",
    (text) => expect(isOptOutText(text)).toBe(true),
  );

  it.each(["don't stop", "stop sending later", "claude", "seguir"])(
    "does not treat free-form text %s as an opt-out",
    (text) => expect(isOptOutText(text)).toBe(false),
  );

  it.each(["START", "subscribe", "INICIAR", "assinar"])(
    "recognizes explicit re-opt-in %s",
    (text) => expect(isOptInText(text)).toBe(true),
  );
});

describe("Instagram messaging eligibility", () => {
  it("allows one private reply through the exact seven-day boundary", () => {
    expect(isPrivateReplyEligible("2026-07-28T12:00:00.000Z", NOW)).toBe(true);
  });

  it("rejects invalid, future, and older-than-seven-day comments", () => {
    expect(isPrivateReplyEligible(undefined, NOW)).toBe(false);
    expect(isPrivateReplyEligible("invalid", NOW)).toBe(false);
    expect(isPrivateReplyEligible("2026-08-04T12:01:00.000Z", NOW)).toBe(false);
    expect(isPrivateReplyEligible("2026-07-28T11:59:59.999Z", NOW)).toBe(false);
  });

  it("allows automated messages only within 24h of a qualifying inbound event", () => {
    expect(isStandardMessagingWindowOpen("2026-08-03T12:00:00.000Z", NOW)).toBe(true);
    expect(isStandardMessagingWindowOpen("2026-08-03T11:59:59.999Z", NOW)).toBe(false);
    expect(isStandardMessagingWindowOpen(undefined, NOW)).toBe(false);
    expect(isStandardMessagingWindowOpen("invalid", NOW)).toBe(false);
  });
});

describe("HTTP Request SSRF guard", () => {
  it.each([
    "http://127.0.0.1/admin",
    "http://10.0.0.5/",
    "http://172.16.0.1/",
    "http://192.168.1.1/",
    "http://169.254.169.254/latest/meta-data",
    "http://[::1]/",
    "http://localhost:3000/",
    "file:///etc/passwd",
    "ftp://example.com/file",
  ])("blocks %s", (url) => expect(() => validateOutboundHttpUrl(url)).toThrow());

  it("allows public HTTPS endpoints", () => {
    expect(validateOutboundHttpUrl("https://api.example.com/v1/items?q=1").href).toBe(
      "https://api.example.com/v1/items?q=1",
    );
  });
});
