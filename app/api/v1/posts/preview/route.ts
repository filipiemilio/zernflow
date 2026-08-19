import { NextRequest, NextResponse } from "next/server";
import { getWorkspace } from "@/lib/workspace";
import { fetchPostPreviews } from "@/lib/instagram-post-previews";

/**
 * GET /api/v1/posts/preview?ids=a,b,c
 *
 * Thumbnails for the flow list's hover cards. Fetched on demand rather than
 * with the page: the list renders instantly without it, and only the posts a
 * person actually hovers cost a request.
 *
 * Post ids are resolved against the caller's own workspace API key, so an id
 * from another account simply comes back not-found.
 */
export async function GET(request: NextRequest) {
  const { workspace, supabase } = await getWorkspace();

  const ids = (request.nextUrl.searchParams.get("ids") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  if (ids.length === 0) {
    return NextResponse.json({ posts: [] });
  }

  const posts = await fetchPostPreviews(supabase, workspace.id, ids);
  return NextResponse.json({ posts });
}
