import { notFound } from "next/navigation";
import { getWorkspace } from "@/lib/workspace";
import { getFlowFunnel, monitoredPostIds } from "@/lib/flow-analytics";
import { fetchPostMetrics } from "@/lib/instagram-post-metrics";
import { FlowFunnelView } from "./flow-funnel-view";

export default async function FlowAnalyticsPage({
  params,
}: {
  params: Promise<{ flowId: string }>;
}) {
  const { flowId } = await params;
  const { workspace, supabase } = await getWorkspace();

  const { data: flow } = await supabase
    .from("flows")
    .select("nodes")
    .eq("id", flowId)
    .eq("workspace_id", workspace.id)
    .single();

  if (!flow) notFound();

  const until = new Date();
  const since = new Date(until.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Post metrics are lifetime-only and need the workspace API key, so they are
  // read once here rather than refetched when the period selector changes.
  const [funnel, postMetrics] = await Promise.all([
    getFlowFunnel(supabase, {
      workspaceId: workspace.id,
      flowId,
      since: since.toISOString(),
      until: until.toISOString(),
    }),
    fetchPostMetrics(supabase, workspace.id, monitoredPostIds(flow.nodes)),
  ]);

  if (!funnel) notFound();

  return (
    <FlowFunnelView
      workspaceId={workspace.id}
      initialFunnel={funnel}
      postMetrics={postMetrics}
    />
  );
}
