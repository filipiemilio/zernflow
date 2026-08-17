import { isIP } from "node:net";

const OPT_OUT_COMMANDS = new Set([
  "stop",
  "unsubscribe",
  "cancel",
  "quit",
  "sair",
  "parar",
  "cancelar",
]);

const OPT_IN_COMMANDS = new Set(["start", "subscribe", "iniciar", "assinar"]);
const DAY_MS = 24 * 60 * 60 * 1000;

function normalizeCommand(text: string): string {
  return text
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("pt-BR")
    .replace(/^[\p{P}\p{S}\s]+|[\p{P}\p{S}\s]+$/gu, "");
}

export function isOptOutText(text: string | null | undefined): boolean {
  return typeof text === "string" && OPT_OUT_COMMANDS.has(normalizeCommand(text));
}

export function isOptInText(text: string | null | undefined): boolean {
  return typeof text === "string" && OPT_IN_COMMANDS.has(normalizeCommand(text));
}

function elapsedMsSince(value: string | null | undefined, now: Date): number | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  const elapsed = now.getTime() - timestamp;
  return elapsed >= 0 ? elapsed : null;
}

/** Meta permits one private reply to a post/reel comment within seven days. */
export function isPrivateReplyEligible(
  commentCreatedAt: string | null | undefined,
  now = new Date(),
): boolean {
  const elapsed = elapsedMsSince(commentCreatedAt, now);
  return elapsed !== null && elapsed <= 7 * DAY_MS;
}

/** Standard automated Instagram messages require a qualifying inbound event in the prior 24h. */
export function isStandardMessagingWindowOpen(
  lastQualifyingInboundAt: string | null | undefined,
  now = new Date(),
): boolean {
  const elapsed = elapsedMsSince(lastQualifyingInboundAt, now);
  return elapsed !== null && elapsed <= DAY_MS;
}

function isBlockedIpv4(hostname: string): boolean {
  const octets = hostname.split(".").map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true;
  }
  const [a, b, c] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "metadata.google.internal"
  ) {
    return true;
  }

  const version = isIP(host);
  if (version === 4) return isBlockedIpv4(host);
  if (version === 6) {
    return (
      host === "::" ||
      host === "::1" ||
      host.startsWith("fc") ||
      host.startsWith("fd") ||
      /^fe[89ab]/.test(host) ||
      host.startsWith("::ffff:")
    );
  }
  return false;
}

/**
 * Rejects local/reserved destinations and non-HTTP protocols before a flow's
 * HTTP Request node can reach the VPS, cloud metadata endpoints, or Supabase.
 */
export function validateOutboundHttpUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("HTTP Request URL is invalid");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("HTTP Request only supports HTTP(S) URLs");
  }
  if (url.username || url.password) {
    throw new Error("Credentials in HTTP Request URLs are not allowed");
  }
  if (isBlockedHostname(url.hostname)) {
    throw new Error("HTTP Request destination is private or reserved");
  }
  return url;
}
