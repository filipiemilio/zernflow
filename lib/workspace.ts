import { cache } from "react";
import { cookies } from "next/headers";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { defaultWorkspaceIdentity } from "@/lib/workspace-bootstrap";
import { redirect } from "next/navigation";

export const WORKSPACE_COOKIE = "zernflow_workspace_id";

/**
 * Cached per-request: deduplicates across layout + page in the same render.
 * Reads workspace ID from cookie if set; falls back to first workspace.
 */
export const getWorkspace = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const cookieStore = await cookies();
  const selectedId = cookieStore.get(WORKSPACE_COOKIE)?.value;

  // Try cookie workspace first
  if (selectedId) {
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id, role, workspaces(*)")
      .eq("user_id", user.id)
      .eq("workspace_id", selectedId)
      .single();

    if (membership?.workspaces) {
      return {
        user,
        workspace: membership.workspaces,
        role: membership.role,
        supabase,
      };
    }
  }

  // Fallback to first workspace
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id, role, workspaces(*)")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership?.workspaces) {
    // A newly registered user has no membership yet. Creating the first
    // workspace with the user-scoped client is impossible because the RLS
    // policy requires an existing owner membership. Bootstrap it server-side.
    const serviceClient = await createServiceClient();
    const identity = defaultWorkspaceIdentity(user);

    const { data: workspace, error: workspaceError } = await serviceClient
      .from("workspaces")
      .upsert(identity, { onConflict: "slug" })
      .select("*")
      .single();

    if (workspaceError || !workspace) {
      throw new Error(
        `Failed to create initial workspace: ${workspaceError?.message ?? "unknown error"}`
      );
    }

    const { error: membershipError } = await serviceClient
      .from("workspace_members")
      .upsert(
        { workspace_id: workspace.id, user_id: user.id, role: "owner" },
        { onConflict: "workspace_id,user_id" }
      );

    if (membershipError) {
      throw new Error(
        `Failed to create initial workspace membership: ${membershipError.message}`
      );
    }

    return {
      user,
      workspace,
      role: "owner",
      supabase,
    };
  }

  return {
    user,
    workspace: membership.workspaces,
    role: membership.role,
    supabase,
  };
});
