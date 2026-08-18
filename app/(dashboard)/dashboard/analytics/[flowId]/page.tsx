import { notFound } from "next/navigation";
import { getWorkspace } from "@/lib/workspace";
import { getFlowFunnel } from "@/lib/flow-analytics";
import { FlowFunnelView } from "./flow-funnel-view";

export default async function FlowAnalyticsPage({
  params,
}: {
  params: Promise<{ flowId: string }>;
}) {
  const { flowId } = await params;
  const { workspace, supabase } = await getWorkspace();

  const until = new Date();
  const since = new Date(until.getTime() - 30 * 24 * 60 * 60 * 1000);

  const funnel = await getFlowFunnel(supabase, {
    workspaceId: workspace.id,
    flowId,
    since: since.toISOString(),
    until: until.toISOString(),
  });

  if (!funnel) notFound();

  return <FlowFunnelView workspaceId={workspace.id} initialFunnel={funnel} />;
}
