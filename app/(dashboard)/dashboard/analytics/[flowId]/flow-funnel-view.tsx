"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Eye, Loader2, UserCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { getFlowFunnel, type FlowFunnel } from "@/lib/flow-analytics";
import type { PostMetrics, PostMetricsSummary } from "@/lib/instagram-post-metrics";
import { FunnelChart } from "@/components/analytics/funnel-chart";

type TimeRange = "7d" | "30d" | "90d";

const TIME_RANGE_OPTIONS: { value: TimeRange; label: string; days: number }[] = [
  { value: "7d", label: "Últimos 7 dias", days: 7 },
  { value: "30d", label: "Últimos 30 dias", days: 30 },
  { value: "90d", label: "Últimos 90 dias", days: 90 },
];

const nf = new Intl.NumberFormat("pt-BR");

export function FlowFunnelView({
  workspaceId,
  initialFunnel,
  postMetrics,
}: {
  workspaceId: string;
  initialFunnel: FlowFunnel;
  postMetrics: PostMetricsSummary | null;
}) {
  const [timeRange, setTimeRange] = useState<TimeRange>("30d");
  const [funnel, setFunnel] = useState<FlowFunnel>(initialFunnel);
  const [loading, setLoading] = useState(false);

  async function handleRangeChange(range: TimeRange) {
    setTimeRange(range);
    if (range === "30d") {
      setFunnel(initialFunnel);
      return;
    }
    setLoading(true);
    try {
      const days = TIME_RANGE_OPTIONS.find((o) => o.value === range)!.days;
      const until = new Date();
      const since = new Date(until.getTime() - days * 24 * 60 * 60 * 1000);
      const next = await getFlowFunnel(createClient(), {
        workspaceId,
        flowId: initialFunnel.flowId,
        since: since.toISOString(),
        until: until.toISOString(),
      });
      if (next) setFunnel(next);
    } finally {
      setLoading(false);
    }
  }

  const enteredStage = funnel.stages[0];
  const completedStage = funnel.stages[funnel.stages.length - 1];
  const flowDropOff = 100 - completedStage.pct;

  // "all" totals every monitored post; a specific id isolates one, which is
  // how a weak call to action shows up — a post can carry most of the views
  // and almost none of the completions.
  const [selectedPost, setSelectedPost] = useState<string>("all");

  const activePost =
    selectedPost === "all"
      ? null
      : (postMetrics?.posts.find((p) => p.postId === selectedPost) ?? null);

  const views = activePost ? activePost.views : (postMetrics?.totals.views ?? 0);
  // Both sides lifetime on purpose: views are only published as a
  // since-publication total, so pairing them with the period's completions
  // would divide a windowed number by an unwindowed one.
  const completions = activePost
    ? (funnel.lifetimeCompletedByPost[activePost.postId] ?? 0)
    : funnel.lifetimeCompleted;
  const viewToCompletion = views > 0 ? (completions / views) * 100 : null;

  const postLabel = (post: PostMetrics) => {
    const date = post.publishedAt
      ? new Date(post.publishedAt).toLocaleDateString("pt-BR", {
          day: "2-digit",
          month: "2-digit",
        })
      : null;
    const shortcode = post.url?.match(/\/(?:reel|p)\/([^/]+)/)?.[1];
    return `${date ?? shortcode ?? post.postId.slice(-6)} · ${nf.format(post.views)} views`;
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-8 py-6">
        <Link
          href="/dashboard/analytics"
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Analytics
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{funnel.flowName}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Funil do comentário até a conclusão do fluxo
            </p>
          </div>
          <div className="flex items-center gap-2">
            {TIME_RANGE_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => handleRangeChange(option.value)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                  timeRange === option.value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-8">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : enteredStage.count === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card py-20">
            <p className="text-sm text-muted-foreground">
              Nenhum comentário bateu no gatilho deste fluxo nesse período.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Entrou no funil" value={nf.format(enteredStage.count)} />
              <StatCard
                label="Completou o fluxo"
                value={nf.format(completedStage.count)}
                sub={`${completedStage.pct}% de quem entrou`}
              />
              <StatCard
                label="Queda geral"
                value={`${flowDropOff}%`}
                sub="entre o comentário e a conclusão"
                tone={flowDropOff > 60 ? "bad" : flowDropOff > 35 ? "warn" : "good"}
              />
              {funnel.followersConfirmed !== null ? (
                <StatCard
                  label="Seguidores ao concluir"
                  value={nf.format(funnel.followersConfirmed)}
                  sub="confirmados ao final — inclui quem já seguia"
                  icon={UserCheck}
                />
              ) : (
                <StatCard
                  label="Seguidores ao concluir"
                  value="—"
                  sub="este fluxo não verifica follow"
                />
              )}
            </div>

            {/* The views card fills the space the centred funnel leaves free.
                Side by side only from xl: below that the funnel column gets
                narrower than the chart's own minimum and starts scrolling. */}
            <div className="grid gap-6 xl:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
              {postMetrics ? (
                <div className="flex flex-col rounded-xl border border-border bg-card p-6">
                  <div className="flex items-center gap-2">
                    <Eye className="h-4 w-4 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Visualizações</p>
                  </div>

                  {postMetrics.posts.length > 1 && (
                    <select
                      value={selectedPost}
                      onChange={(e) => setSelectedPost(e.target.value)}
                      className="mt-2 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      <option value="all">
                        Todas · {nf.format(postMetrics.totals.views)} views
                      </option>
                      {postMetrics.posts.map((post) => (
                        <option key={post.postId} value={post.postId}>
                          {postLabel(post)}
                        </option>
                      ))}
                    </select>
                  )}

                  <p className="mt-3 text-3xl font-bold">{nf.format(views)}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {activePost ? (
                      activePost.url ? (
                        <a
                          href={activePost.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 hover:underline"
                        >
                          ver publicação
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        "desta publicação"
                      )
                    ) : postMetrics.posts.length === 1 ? (
                      "da publicação monitorada"
                    ) : (
                      `somadas de ${postMetrics.posts.length} publicações`
                    )}
                  </p>

                  <div className="mt-4 border-t border-border pt-4">
                    <p className="text-xl font-semibold">
                      {viewToCompletion === null ? "—" : `${viewToCompletion.toFixed(1)}%`}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      de quem viu chegou ao fim do fluxo
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground/70">
                      {nf.format(completions)}{" "}
                      {completions === 1 ? "conclusão" : "conclusões"}
                      {activePost && completions === 0 && " — nunca gerou sessão"}
                    </p>
                  </div>

                  {activePost && !activePost.synced && (
                    <p className="mt-3 text-[11px] text-amber-600">
                      Métricas desta publicação ainda não sincronizaram.
                    </p>
                  )}

                  <p className="mt-auto pt-4 text-[11px] leading-relaxed text-muted-foreground/70">
                    Números totais desde a publicação — não seguem o período
                    selecionado acima.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col justify-center rounded-xl border border-dashed border-border p-6">
                  <p className="text-sm text-muted-foreground">Sem visualizações</p>
                  <p className="mt-1 text-xs text-muted-foreground/70">
                    O gatilho deste fluxo não está limitado a publicações específicas,
                    então não há um post único para medir.
                  </p>
                </div>
              )}

              <div className="rounded-xl border border-border bg-card p-8">
                <h3 className="mb-6 text-sm font-semibold">Funil da campanha</h3>
                <FunnelChart stages={funnel.stages} />
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              &ldquo;Respondeu no Direct&rdquo; conta quem mandou qualquer mensagem de volta — o
              Instagram não expõe quem apenas abriu a DM sem responder.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  tone,
  icon: Icon,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "good" | "warn" | "bad";
  icon?: typeof UserCheck;
}) {
  const toneClass =
    tone === "bad"
      ? "text-red-600"
      : tone === "warn"
        ? "text-yellow-600"
        : tone === "good"
          ? "text-green-600"
          : "text-foreground";

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="flex items-center gap-2">
        {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
      <p className={cn("mt-1 text-2xl font-bold", toneClass)}>{value}</p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}
