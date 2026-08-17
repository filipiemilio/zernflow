import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { normalizeExternalPosts } from "@/lib/zernio-posts";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 404 });

  const [{ data: workspace }, { data: channels, error: channelsError }] = await Promise.all([
    supabase
      .from("workspaces")
      .select("late_api_key_encrypted")
      .eq("id", membership.workspace_id)
      .single(),
    supabase
      .from("channels")
      .select("id, username, display_name, late_account_id")
      .eq("workspace_id", membership.workspace_id)
      .eq("platform", "instagram")
      .eq("is_active", true)
      .order("created_at", { ascending: true }),
  ]);

  if (channelsError) {
    return NextResponse.json({ error: channelsError.message }, { status: 500 });
  }

  if (!workspace?.late_api_key_encrypted) {
    return NextResponse.json({ error: "Zernio API key is not configured" }, { status: 400 });
  }

  const results = await Promise.all(
    (channels ?? []).map(async (channel) => {
      try {
        const response = await fetch("https://zernio.com/api/v1/posts/sync-external", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${workspace.late_api_key_encrypted}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ accountId: channel.late_account_id }),
          cache: "no-store",
          signal: AbortSignal.timeout(45_000),
        });

        if (!response.ok) {
          const message = await response.text();
          return {
            id: channel.id,
            username: channel.username,
            displayName: channel.display_name,
            posts: [],
            error: message || `Zernio returned ${response.status}`,
          };
        }

        const payload = (await response.json()) as { posts?: unknown; post?: unknown };
        const rawPosts = payload.posts ?? (payload.post ? [payload.post] : []);
        return {
          id: channel.id,
          username: channel.username,
          displayName: channel.display_name,
          posts: normalizeExternalPosts(rawPosts),
          error: null,
        };
      } catch (error) {
        return {
          id: channel.id,
          username: channel.username,
          displayName: channel.display_name,
          posts: [],
          error: error instanceof Error ? error.message : "Failed to load posts",
        };
      }
    })
  );

  return NextResponse.json({ channels: results });
}
