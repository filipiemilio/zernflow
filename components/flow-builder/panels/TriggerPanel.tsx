"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Loader2, Plus, RefreshCw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TriggerType } from "@/lib/types/database";

interface Keyword {
  value: string;
  matchType: "exact" | "contains" | "startsWith";
}

interface TriggerPanelData {
  triggerType?: string;
  keywords?: Keyword[];
  payload?: string;
  postScope?: "all" | "specific";
  postIds?: string[];
  postSourceChannelId?: string;
  /** Legacy single public reply, kept readable for rules saved before variations. */
  replyText?: string;
  /** Public reply variations; one is drawn at random per matching comment. */
  replyTexts?: string[];
  [key: string]: unknown;
}

interface PostSelectorItem {
  id: string;
  url: string | null;
  caption: string;
  thumbnailUrl: string | null;
  publishedAt: string | null;
  mediaType: string | null;
}

interface PostSelectorChannel {
  id: string;
  username: string | null;
  displayName: string | null;
  posts: PostSelectorItem[];
  error: string | null;
}

interface TriggerPanelProps {
  data: Record<string, unknown>;
  onChange: (data: Record<string, unknown>) => void;
}

const triggerTypes: Array<{ value: TriggerType; label: string; description: string }> = [
  { value: "keyword", label: "Keyword", description: "Triggered when a user sends a matching keyword" },
  { value: "postback", label: "Button Click", description: "Triggered when a user clicks a button" },
  { value: "quick_reply", label: "Quick Reply", description: "Triggered when a user taps a quick reply" },
  { value: "welcome", label: "Welcome Message", description: "Triggered when a user starts a conversation" },
  { value: "default", label: "Default Reply", description: "Triggered when no other trigger matches" },
  { value: "comment_keyword", label: "Comment Keyword", description: "Triggered by keywords in post comments" },
];

const matchTypes: Array<{ value: "exact" | "contains" | "startsWith"; label: string }> = [
  { value: "exact", label: "Exact match" },
  { value: "contains", label: "Contains" },
  { value: "startsWith", label: "Starts with" },
];

export function TriggerPanel({ data: rawData, onChange }: TriggerPanelProps) {
  const data = rawData as TriggerPanelData;
  const triggerType = data.triggerType || "keyword";
  const keywords = data.keywords || [];
  const [newKeyword, setNewKeyword] = useState("");
  const [newMatchType, setNewMatchType] = useState<"exact" | "contains" | "startsWith">("contains");
  const [postChannels, setPostChannels] = useState<PostSelectorChannel[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [postsLoaded, setPostsLoaded] = useState(false);
  const [postsError, setPostsError] = useState<string | null>(null);

  const postIds = data.postIds || [];
  const postScope =
    data.postScope === "specific" || (!data.postScope && postIds.length > 0)
      ? "specific"
      : "all";
  // Start with three empty slots (matching the reference product) so the reply
  // variations are discoverable; blank slots are dropped when the flow publishes.
  const replyTexts =
    data.replyTexts ?? (data.replyText ? [data.replyText] : ["", "", ""]);
  const filledReplyCount = replyTexts.filter((text) => text.trim()).length;
  const selectedSourceChannelId =
    data.postSourceChannelId || postChannels[0]?.id || "";
  const selectedPostChannel =
    postChannels.find((channel) => channel.id === selectedSourceChannelId) || postChannels[0];

  const loadPosts = useCallback(async () => {
    setLoadingPosts(true);
    setPostsError(null);
    try {
      const response = await fetch("/api/v1/channels/posts", { cache: "no-store" });
      const payload = (await response.json()) as {
        channels?: PostSelectorChannel[];
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || "Failed to load Instagram posts");
      setPostChannels(payload.channels || []);
      setPostsLoaded(true);
    } catch (error) {
      setPostsError(error instanceof Error ? error.message : "Failed to load Instagram posts");
      setPostsLoaded(true);
    } finally {
      setLoadingPosts(false);
    }
  }, []);

  useEffect(() => {
    if (triggerType === "comment_keyword" && !postsLoaded && !loadingPosts) {
      void loadPosts();
    }
  }, [loadPosts, loadingPosts, postsLoaded, triggerType]);

  const setPostScope = useCallback(
    (scope: "all" | "specific") => {
      onChange({
        ...data,
        postScope: scope,
        postIds: scope === "all" ? [] : postIds,
      });
    },
    [data, onChange, postIds]
  );

  const togglePost = useCallback(
    (postId: string) => {
      const selected = new Set(postIds);
      if (selected.has(postId)) selected.delete(postId);
      else selected.add(postId);
      onChange({ ...data, postScope: "specific", postIds: [...selected] });
    },
    [data, onChange, postIds]
  );

  const selectPostSourceChannel = useCallback(
    (channelId: string) => {
      onChange({ ...data, postSourceChannelId: channelId, postIds: [] });
    },
    [data, onChange]
  );

  const commitReplyTexts = useCallback(
    (updated: string[]) => {
      // Variations supersede the legacy single reply, so drop it on write and
      // leave the published trigger with a single source of truth.
      const next = { ...data, replyTexts: updated };
      delete next.replyText;
      onChange(next);
    },
    [data, onChange]
  );

  const updateReplyText = useCallback(
    (index: number, value: string) => {
      commitReplyTexts(replyTexts.map((text, i) => (i === index ? value : text)));
    },
    [commitReplyTexts, replyTexts]
  );

  const addReplyVariation = useCallback(() => {
    commitReplyTexts([...replyTexts, ""]);
  }, [commitReplyTexts, replyTexts]);

  const removeReplyVariation = useCallback(
    (index: number) => {
      commitReplyTexts(replyTexts.filter((_, i) => i !== index));
    },
    [commitReplyTexts, replyTexts]
  );

  const handleTriggerTypeChange = useCallback(
    (type: string) => {
      onChange({ ...data, triggerType: type });
    },
    [data, onChange]
  );

  const addKeyword = useCallback(() => {
    const trimmed = newKeyword.trim();
    if (!trimmed) return;
    const updated: Keyword[] = [...keywords, { value: trimmed, matchType: newMatchType }];
    onChange({ ...data, keywords: updated });
    setNewKeyword("");
  }, [data, keywords, newKeyword, newMatchType, onChange]);

  const removeKeyword = useCallback(
    (index: number) => {
      const updated = keywords.filter((_, i) => i !== index);
      onChange({ ...data, keywords: updated });
    },
    [data, keywords, onChange]
  );

  const updateKeywordMatchType = useCallback(
    (index: number, matchType: "exact" | "contains" | "startsWith") => {
      const updated = keywords.map((k, i) => (i === index ? { ...k, matchType } : k));
      onChange({ ...data, keywords: updated });
    },
    [data, keywords, onChange]
  );

  const showKeywords = triggerType === "keyword" || triggerType === "comment_keyword";
  const showPayload = triggerType === "postback" || triggerType === "quick_reply";

  return (
    <div className="space-y-5">
      {/* Trigger Type */}
      <div>
        <label className="mb-2 block text-xs font-semibold text-foreground">
          Trigger Type
        </label>
        <div className="space-y-1.5">
          {triggerTypes.map((t) => (
            <label
              key={t.value}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
                triggerType === t.value
                  ? "border-emerald-500 bg-emerald-50 dark:border-emerald-400 dark:bg-emerald-950/40"
                  : "border-border bg-card hover:border-input"
              )}
            >
              <input
                type="radio"
                name="triggerType"
                value={t.value}
                checked={triggerType === t.value}
                onChange={() => handleTriggerTypeChange(t.value)}
                className="mt-0.5 h-4 w-4 border-input text-emerald-500 focus:ring-emerald-500"
              />
              <div>
                <p className={cn(
                  "text-sm font-medium",
                  triggerType === t.value
                    ? "text-emerald-950 dark:text-emerald-100"
                    : "text-foreground"
                )}>{t.label}</p>
                <p className="text-xs text-muted-foreground">{t.description}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Keywords Section */}
      {showKeywords && (
        <div>
          <label className="mb-2 block text-xs font-semibold text-foreground">
            Keywords
          </label>

          {/* Existing keywords */}
          {keywords.length > 0 && (
            <div className="mb-3 space-y-2">
              {keywords.map((keyword, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 rounded-lg border border-border bg-card p-2"
                >
                  <span className="flex-1 truncate text-sm text-foreground">
                    {keyword.value}
                  </span>
                  <select
                    value={keyword.matchType}
                    onChange={(e) =>
                      updateKeywordMatchType(index, e.target.value as "exact" | "contains" | "startsWith")
                    }
                    className="rounded border border-border bg-muted px-2 py-1 text-xs text-foreground"
                  >
                    {matchTypes.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => removeKeyword(index)}
                    className="rounded p-1 text-muted-foreground/60 hover:bg-muted hover:text-muted-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add new keyword */}
          <div className="flex min-w-0 items-center gap-2">
            <input
              type="text"
              value={newKeyword}
              onChange={(e) => setNewKeyword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addKeyword();
                }
              }}
              placeholder="Enter keyword..."
              className="min-w-0 flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
            <select
              value={newMatchType}
              onChange={(e) => setNewMatchType(e.target.value as "exact" | "contains" | "startsWith")}
              className="shrink-0 max-w-[105px] rounded-lg border border-border bg-card px-2 py-2 text-xs text-foreground focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              {matchTypes.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={addKeyword}
              disabled={!newKeyword.trim()}
              className="shrink-0 rounded-lg bg-emerald-500 p-2 text-white transition-colors hover:bg-emerald-600 disabled:opacity-40"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          {keywords.length === 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              Add keywords that will trigger this flow. Press Enter or click + to add.
            </p>
          )}
        </div>
      )}

      {/* Instagram post scope */}
      {triggerType === "comment_keyword" && (
        <div className="space-y-3">
          <div>
            <label className="mb-2 block text-xs font-semibold text-foreground">
              Publications
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPostScope("all")}
                className={cn(
                  "rounded-lg border p-2.5 text-left transition-colors",
                  postScope === "all"
                    ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30"
                    : "border-border bg-card hover:border-input"
                )}
              >
                <span className="block text-xs font-semibold">All posts</span>
                <span className="mt-0.5 block text-[10px] text-muted-foreground">
                  Current and future posts
                </span>
              </button>
              <button
                type="button"
                onClick={() => setPostScope("specific")}
                className={cn(
                  "rounded-lg border p-2.5 text-left transition-colors",
                  postScope === "specific"
                    ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30"
                    : "border-border bg-card hover:border-input"
                )}
              >
                <span className="block text-xs font-semibold">Specific posts</span>
                <span className="mt-0.5 block text-[10px] text-muted-foreground">
                  Select visually below
                </span>
              </button>
            </div>
          </div>

          {postScope === "specific" && (
            <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold">Instagram account</p>
                  {postChannels.length === 1 && (
                    <p className="truncate text-[11px] text-muted-foreground">
                      @{postChannels[0].username || postChannels[0].displayName || "Instagram"}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => void loadPosts()}
                  disabled={loadingPosts}
                  className="rounded-md border border-border bg-card p-1.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                  title="Refresh posts"
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", loadingPosts && "animate-spin")} />
                </button>
              </div>

              {postChannels.length > 1 && (
                <select
                  value={selectedSourceChannelId}
                  onChange={(event) => selectPostSourceChannel(event.target.value)}
                  className="w-full rounded-lg border border-border bg-card px-2.5 py-2 text-xs text-foreground"
                >
                  {postChannels.map((channel) => (
                    <option key={channel.id} value={channel.id}>
                      @{channel.username || channel.displayName || channel.id}
                    </option>
                  ))}
                </select>
              )}

              {loadingPosts && !postsLoaded && (
                <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading recent posts...
                </div>
              )}

              {postsError && (
                <div className="rounded-md border border-red-200 bg-red-50 p-2 text-[11px] text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
                  {postsError}
                </div>
              )}

              {!loadingPosts && !postsError && postChannels.length === 0 && (
                <p className="py-4 text-center text-xs text-muted-foreground">
                  No active Instagram account found.
                </p>
              )}

              {selectedPostChannel?.error && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                  Could not load posts for this account. Use refresh to try again.
                </div>
              )}

              {selectedPostChannel && selectedPostChannel.posts.length > 0 && (
                <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                  {selectedPostChannel.posts.map((post) => {
                    const selected = postIds.includes(post.id);
                    return (
                      <div
                        key={post.id}
                        role="checkbox"
                        aria-checked={selected}
                        tabIndex={0}
                        onClick={() => togglePost(post.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            togglePost(post.id);
                          }
                        }}
                        className={cn(
                          "flex cursor-pointer gap-2 rounded-lg border p-2 transition-colors",
                          selected
                            ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30"
                            : "border-border bg-card hover:border-input"
                        )}
                      >
                        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md bg-muted">
                          {post.thumbnailUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={post.thumbnailUrl}
                              alt="Instagram post thumbnail"
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center text-[9px] text-muted-foreground">
                              No image
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-2 text-[11px] font-medium text-foreground">
                            {post.caption}
                          </p>
                          <div className="mt-1 flex items-center justify-between gap-2">
                            <span className="text-[10px] text-muted-foreground">
                              {post.publishedAt
                                ? new Date(post.publishedAt).toLocaleDateString("pt-BR")
                                : post.mediaType || "Instagram"}
                            </span>
                            {post.url && (
                              <a
                                href={post.url}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(event) => event.stopPropagation()}
                                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                                title="Open on Instagram"
                              >
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                          </div>
                        </div>
                        <div
                          className={cn(
                            "mt-1 h-4 w-4 shrink-0 rounded border",
                            selected
                              ? "border-emerald-500 bg-emerald-500 shadow-inner"
                              : "border-input bg-card"
                          )}
                        >
                          {selected && <span className="block text-center text-[10px] leading-[14px] text-white">✓</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {selectedPostChannel && !selectedPostChannel.error && selectedPostChannel.posts.length === 0 && !loadingPosts && (
                <p className="py-4 text-center text-xs text-muted-foreground">
                  No recent posts were returned by Instagram.
                </p>
              )}

              <div
                className={cn(
                  "rounded-md px-2 py-1.5 text-[11px]",
                  postIds.length > 0
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
                    : "bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-200"
                )}
              >
                {postIds.length > 0
                  ? `${postIds.length} publication${postIds.length === 1 ? "" : "s"} selected`
                  : "Select at least one post. Until then, this trigger will not run."}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Public reply variations */}
      {triggerType === "comment_keyword" && (
        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <label className="block text-xs font-semibold text-foreground">
              Public replies
            </label>
            <button
              type="button"
              onClick={addReplyVariation}
              className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-emerald-600 hover:underline dark:text-emerald-400"
            >
              <Plus className="h-3.5 w-3.5" />
              Add variation
            </button>
          </div>

          {replyTexts.length > 0 && (
            <div className="space-y-2">
              {replyTexts.map((replyText, index) => (
                <div key={index} className="flex min-w-0 items-center gap-2">
                  <input
                    type="text"
                    value={replyText}
                    onChange={(e) => updateReplyText(index, e.target.value)}
                    placeholder={`Variation ${index + 1}: Check your DMs!`}
                    className="min-w-0 flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={() => removeReplyVariation(index)}
                    aria-label={`Remove variation ${index + 1}`}
                    className="shrink-0 rounded p-1 text-muted-foreground/60 hover:bg-muted hover:text-muted-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <p className="mt-2 text-xs text-muted-foreground">
            {filledReplyCount > 1
              ? `One of the ${filledReplyCount} variations is drawn at random for each matching comment. Blank fields are not saved.`
              : filledReplyCount === 1
                ? "This reply is posted on every matching comment. Add more variations to rotate between them."
                : "Optional. Add at least one variation to reply publicly to the comment before sending the DM."}
          </p>
        </div>
      )}

      {/* Payload Section */}
      {showPayload && (
        <div>
          <label className="mb-2 block text-xs font-semibold text-foreground">
            Payload
          </label>
          <input
            type="text"
            value={data.payload || ""}
            onChange={(e) => onChange({ ...data, payload: e.target.value })}
            placeholder="Enter payload value..."
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            The payload value to match when a {triggerType === "postback" ? "button is clicked" : "quick reply is tapped"}.
          </p>
        </div>
      )}
    </div>
  );
}
