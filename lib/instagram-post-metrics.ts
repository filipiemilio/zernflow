import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { createZernioClient } from "@/lib/zernio-client";

export interface PostMetrics {
  postId: string;
  url: string | null;
  thumbnailUrl: string | null;
  publishedAt: string | null;
  views: number;
  reach: number;
  /** Every comment on the post, not only the ones matching the trigger keyword. */
  comments: number;
  saves: number;
  shares: number;
  /** False when the platform has not reported figures for this post yet. */
  synced: boolean;
}

export interface PostMetricsSummary {
  posts: PostMetrics[];
  totals: { views: number; reach: number; comments: number; saves: number; shares: number };
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * Lifetime figures for the posts a comment trigger watches, read live from
 * Zernio. These are always since-publication totals — the platform exposes no
 * date-windowed breakdown here — so callers must not present them alongside a
 * period filter as though they shared its range.
 *
 * Returns null when the metrics cannot be read at all, so a funnel still
 * renders if the vendor is unreachable; individual posts that fail are simply
 * marked unsynced rather than failing the batch.
 */
export async function fetchPostMetrics(
  supabase: SupabaseClient<Database>,
  workspaceId: string,
  postIds: string[],
): Promise<PostMetricsSummary | null> {
  if (postIds.length === 0) return null;

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("late_api_key_encrypted")
    .eq("id", workspaceId)
    .single();

  if (!workspace?.late_api_key_encrypted) return null;

  const zernio = createZernioClient(workspace.late_api_key_encrypted);

  const posts = await Promise.all(
    postIds.map(async (postId): Promise<PostMetrics> => {
      const empty: PostMetrics = {
        postId,
        url: null,
        thumbnailUrl: null,
        publishedAt: null,
        views: 0,
        reach: 0,
        comments: 0,
        saves: 0,
        shares: 0,
        synced: false,
      };

      try {
        const response = await zernio.analytics.getAnalytics({ query: { postId } });
        const post = response.data as
          | {
              analytics?: Record<string, unknown>;
              platformPostUrl?: string | null;
              thumbnailUrl?: string | null;
              publishedAt?: string | null;
              syncStatus?: string;
            }
          | undefined;

        const analytics = post?.analytics;
        if (!analytics) return empty;

        return {
          postId,
          url: post?.platformPostUrl ?? null,
          thumbnailUrl: post?.thumbnailUrl ?? null,
          publishedAt: post?.publishedAt ?? null,
          views: num(analytics.views),
          reach: num(analytics.reach),
          comments: num(analytics.comments),
          saves: num(analytics.saves),
          shares: num(analytics.shares),
          synced: post?.syncStatus === "synced",
        };
      } catch (error) {
        console.warn(`Post metrics unavailable for ${postId}`, error);
        return empty;
      }
    }),
  );

  const totals = posts.reduce(
    (acc, post) => ({
      views: acc.views + post.views,
      reach: acc.reach + post.reach,
      comments: acc.comments + post.comments,
      saves: acc.saves + post.saves,
      shares: acc.shares + post.shares,
    }),
    { views: 0, reach: 0, comments: 0, saves: 0, shares: 0 },
  );

  return { posts, totals };
}
