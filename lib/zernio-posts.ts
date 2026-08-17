export interface ExternalPostSelectorItem {
  id: string;
  url: string | null;
  caption: string;
  thumbnailUrl: string | null;
  publishedAt: string | null;
  mediaType: string | null;
}

interface ExternalPostPayload {
  platformPostId?: unknown;
  platformPostUrl?: unknown;
  content?: unknown;
  thumbnailUrl?: unknown;
  mediaUrl?: unknown;
  publishedAt?: unknown;
  mediaType?: unknown;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function normalizeExternalPosts(posts: unknown): ExternalPostSelectorItem[] {
  if (!Array.isArray(posts)) return [];

  return posts.flatMap((raw) => {
    const post = (raw ?? {}) as ExternalPostPayload;
    const id = stringOrNull(post.platformPostId);
    if (!id) return [];

    return [
      {
        id,
        url: stringOrNull(post.platformPostUrl),
        caption: stringOrNull(post.content) ?? "Publicação sem legenda",
        thumbnailUrl: stringOrNull(post.thumbnailUrl) ?? stringOrNull(post.mediaUrl),
        publishedAt: stringOrNull(post.publishedAt),
        mediaType: stringOrNull(post.mediaType),
      },
    ];
  });
}
