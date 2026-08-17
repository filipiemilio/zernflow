import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { signupRateLimiter } from "@/lib/signup-rate-limit";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clientIp(request: NextRequest) {
  // The app is only exposed through Caddy. Its forwarded address is used for
  // throttling; localhost callers are grouped rather than trusted individually.
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",").at(-1)?.trim() || request.headers.get("x-real-ip") || "unknown";
}

/** Public, rate-limited account registration endpoint. */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!name || name.length > 100 || !EMAIL_PATTERN.test(email) || email.length > 254 || password.length < 8 || password.length > 128) {
    return NextResponse.json({ error: "Invalid registration details" }, { status: 400 });
  }

  const limit = signupRateLimiter.check(clientIp(request), email);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many registration attempts. Try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfterSeconds ?? 900) },
      },
    );
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: name },
      // Never derive this from the request Host header.
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
    },
  });

  if (error) {
    // Do not leak whether an address already has an account.
    return NextResponse.json(
      { error: "Unable to create the account. Check your email or try again later." },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
