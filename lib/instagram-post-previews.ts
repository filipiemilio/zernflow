import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { createZernioClient } from "@/lib/zernio-client";

export interface PostPreview {
  id: string;
  url: string | null;
  thumbnailUrl: string | null;
  publishedAt: string | null;
  /** False when the platform did not return this post on either attempt. */
  found: boolean;
}

/**
 * Zernio answers post_not_found under load, so a burst of requests reports
 * live posts as missing: ten at once had five fail, while the same ids
 * succeeded three at a time. Keeping the window small is what makes a
 * "not found" mean something.
 */
const MAX_CONCURRENT = 3;

/** Guards against a caller asking for an unbounded number of posts. */
const MAX_POSTS = 12;

async function fetchOne(
  zernio: ReturnType<typeof createZernioClient>,
  postId: string,
): Promise<PostPreview> {
  const missing: PostPreview = {
    id: postId,
    url: null,
    thumbnailUrl: null,
    publishedAt: null,
    found: false,
  };

  // Retried once: a first failure is as likely to be load shedding as a
  // deleted post, and reporting a real post as gone is the worse error.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await zernio.analytics.getAnalytics({ query: { postId } });
      const post = response.data as
        | { platformPostUrl?: string | null; thumbnailUrl?: string | null; publishedAt?: string | null }
        | undefined;
      if (!post) continue;
      return {
        id: postId,
        url: post.platformPostUrl ?? null,
        thumbnailUrl: post.thumbnailUrl ?? null,
        publishedAt: post.publishedAt ?? null,
        found: true,
      };
    } catch {
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  return missing;
}

export async function fetchPostPreviews(
  supabase: SupabaseClient<Database>,
  workspaceId: string,
  postIds: string[],
): Promise<PostPreview[]> {
  const ids = [...new Set(postIds.filter(Boolean))].slice(0, MAX_POSTS);
  if (ids.length === 0) return [];

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("late_api_key_encrypted")
    .eq("id", workspaceId)
    .single();

  if (!workspace?.late_api_key_encrypted) return [];

  const zernio = createZernioClient(workspace.late_api_key_encrypted);

  const previews: PostPreview[] = [];
  for (let i = 0; i < ids.length; i += MAX_CONCURRENT) {
    const batch = ids.slice(i, i + MAX_CONCURRENT);
    previews.push(...(await Promise.all(batch.map((id) => fetchOne(zernio, id)))));
  }
  return previews;
}
