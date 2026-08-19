"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Globe, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FlowTriggerSummary } from "@/lib/flow-analytics";

interface PostPreview {
  id: string;
  url: string | null;
  thumbnailUrl: string | null;
  publishedAt: string | null;
  found: boolean;
}

/**
 * Shared across cards for the page's lifetime, so hovering the same flow twice
 * — or two flows watching the same post — costs one request, not two.
 */
const previewCache = new Map<string, Promise<PostPreview[]>>();

function loadPreviews(postIds: string[]): Promise<PostPreview[]> {
  const key = postIds.join(",");
  const cached = previewCache.get(key);
  if (cached) return cached;

  const request = fetch(`/api/v1/posts/preview?ids=${encodeURIComponent(key)}`)
    .then((res) => (res.ok ? res.json() : { posts: [] }))
    .then((body: { posts?: PostPreview[] }) => body.posts ?? [])
    .catch(() => {
      // Not cached on failure, so the next hover retries instead of
      // remembering an empty result forever.
      previewCache.delete(key);
      return [] as PostPreview[];
    });

  previewCache.set(key, request);
  return request;
}

export function FlowPostsBadge({ summary }: { summary: FlowTriggerSummary }) {
  const [open, setOpen] = useState(false);
  const [previews, setPreviews] = useState<PostPreview[] | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const postIds = summary.postIds;

  /**
   * Started from the whole badge row, which is a far wider target than the
   * count itself. The pointer's travel from the row's edge to the text covers
   * most of the request, so the card opens filled instead of loading.
   */
  const prefetch = useCallback(() => {
    if (previews !== null || postIds.length === 0) return;
    loadPreviews(postIds).then((posts) => {
      if (alive.current) setPreviews(posts);
    });
  }, [postIds, previews]);

  if (!summary.isCommentFlow) return null;

  const count = postIds.length;
  const missing = previews?.filter((p) => !p.found).length ?? 0;

  return (
    <div
      onMouseEnter={prefetch}
      className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[11px]"
    >
      {summary.keywords.map((keyword) => (
        <span
          key={keyword}
          className="inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 font-mono text-primary"
        >
          <span className="h-1 w-1 rounded-full bg-primary" />
          {keyword}
        </span>
      ))}

      {summary.watchesAllPosts ? (
        <span className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-border px-2 py-0.5 font-mono text-muted-foreground">
          <Globe className="h-3 w-3" />
          todas as publicações
        </span>
      ) : count > 0 ? (
        <span
          className="relative"
          onMouseEnter={() => {
            prefetch();
            setOpen(true);
          }}
          onMouseLeave={() => setOpen(false)}
        >
          <span
            className={cn(
              "font-mono underline decoration-dotted underline-offset-4 transition-colors",
              open ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {count} {count === 1 ? "publicação" : "publicações"}
          </span>

          {open && (
            <span
              role="tooltip"
              className="absolute bottom-full left-0 z-50 mb-2 block w-max max-w-[290px] rounded-lg border border-border bg-popover p-2 shadow-xl"
            >
              {previews === null ? (
                <span className="flex items-center gap-2 px-1 py-2 text-[11px] text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  carregando publicações
                </span>
              ) : (
                <>
                  <span className="flex gap-2">
                    {previews.map((post) => (
                      <span key={post.id} className="block w-[54px]">
                        {post.found ? (
                          <span className="block h-[72px] w-[54px] overflow-hidden rounded-md border border-border bg-muted">
                            {post.thumbnailUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={post.thumbnailUrl}
                                alt=""
                                loading="lazy"
                                className="h-full w-full object-cover"
                              />
                            ) : null}
                          </span>
                        ) : (
                          <span className="flex h-[72px] w-[54px] items-center justify-center rounded-md border border-dashed border-amber-500/50 bg-amber-500/10">
                            <AlertTriangle className="h-4 w-4 text-amber-500" />
                          </span>
                        )}
                        <span
                          className={cn(
                            "mt-1 block text-center font-mono text-[10px]",
                            post.found
                              ? "text-muted-foreground"
                              : "text-amber-600 dark:text-amber-500",
                          )}
                        >
                          {post.found && post.publishedAt
                            ? new Date(post.publishedAt).toLocaleDateString("pt-BR", {
                                day: "2-digit",
                                month: "2-digit",
                              })
                            : post.found
                              ? "—"
                              : "?"}
                        </span>
                      </span>
                    ))}
                  </span>

                  {missing > 0 && (
                    <span className="mt-2 block max-w-[270px] text-[10px] leading-snug text-amber-600 dark:text-amber-500">
                      {missing === 1
                        ? "1 publicação não foi encontrada — pode ter sido apagada."
                        : `${missing} publicações não foram encontradas — podem ter sido apagadas.`}
                    </span>
                  )}
                </>
              )}
            </span>
          )}
        </span>
      ) : (
        <span className="font-mono text-muted-foreground">nenhuma publicação</span>
      )}
    </div>
  );
}
