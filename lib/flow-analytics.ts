import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

export interface FunnelStage {
  key: "entered" | "dmDelivered" | "engaged" | "completed";
  label: string;
  count: number;
  /** Percentage of the first stage's count; the first stage is always 100. */
  pct: number;
}

export interface FlowFunnel {
  flowId: string;
  flowName: string;
  since: string;
  until: string;
  stages: FunnelStage[];
  /**
   * Sessions confirmed as a follower at completion, or null when the flow has
   * no instagram_follower condition node — most flows never gate on this, and
   * a 0 would misreport "nobody followed" instead of "not tracked here".
   */
  followersConfirmed: number | null;
}

interface SessionRow {
  status: string;
  variables: Record<string, unknown> | null;
}

const STAGE_LABELS: Record<FunnelStage["key"], string> = {
  entered: "Comentou a keyword",
  dmDelivered: "DM entregue",
  engaged: "Respondeu no Direct",
  completed: "Completou o fluxo",
};

/**
 * Pure funnel math, kept separate from the Supabase fetch so it is testable
 * without a database. Each stage counts sessions carrying evidence of that
 * step; "DM delivered" and "engaged" read variables the engine already
 * writes for every comment-triggered flow, not anything this feature had
 * to instrument.
 *
 * "engaged" cannot just check that variables.message is set: engine.ts sets
 * `variables.message ??= incomingMessage.text` on the very first node of
 * every session, so a contact who never replied still carries the original
 * comment's text there. Verified against production data (texto whisper):
 * with that naive check, "replied" came out higher than "DM delivered" —
 * impossible, since you cannot reply to a DM you were never sent. Comparing
 * against comment_text (only present on comment-triggered sessions) filters
 * that default out; sessions without it fall back to presence, since there
 * is nothing to compare against.
 */
export function computeFunnelStages(sessions: SessionRow[]): FunnelStage[] {
  const entered = sessions.length;
  const dmDelivered = sessions.filter(
    (s) => s.variables?.private_reply_sent === "true",
  ).length;
  const engaged = sessions.filter((s) => {
    const message = s.variables?.message;
    if (typeof message !== "string" || message.trim().length === 0) return false;
    const commentText = s.variables?.comment_text;
    if (typeof commentText === "string") return message !== commentText;
    return true;
  }).length;
  const completed = sessions.filter((s) => s.status === "completed").length;

  const counts: Record<FunnelStage["key"], number> = {
    entered,
    dmDelivered,
    engaged,
    completed,
  };

  return (Object.keys(counts) as FunnelStage["key"][]).map((key) => ({
    key,
    label: STAGE_LABELS[key],
    count: counts[key],
    pct: entered > 0 ? Math.round((counts[key] / entered) * 100) : 0,
  }));
}

function hasFollowerGateNode(nodes: unknown): boolean {
  if (!Array.isArray(nodes)) return false;
  return nodes.some((node) => {
    const data = (node as { data?: Record<string, unknown> })?.data;
    return data?.conditionType === "instagram_follower";
  });
}

export async function getFlowFunnel(
  supabase: SupabaseClient<Database>,
  params: { workspaceId: string; flowId: string; since: string; until: string },
): Promise<FlowFunnel | null> {
  const { workspaceId, flowId, since, until } = params;

  const { data: flow } = await supabase
    .from("flows")
    .select("id, name, nodes")
    .eq("id", flowId)
    .eq("workspace_id", workspaceId)
    .single();

  if (!flow) return null;

  const { data: sessions } = await supabase
    .from("flow_sessions")
    .select("status, variables")
    .eq("flow_id", flowId)
    .gte("created_at", since)
    .lte("created_at", until);

  const rows = (sessions ?? []) as SessionRow[];
  const stages = computeFunnelStages(rows);

  const followersConfirmed = hasFollowerGateNode(flow.nodes)
    ? rows.filter(
        (s) => s.status === "completed" && s.variables?.instagram_follower === "true",
      ).length
    : null;

  return {
    flowId: flow.id,
    flowName: flow.name,
    since,
    until,
    stages,
    followersConfirmed,
  };
}
