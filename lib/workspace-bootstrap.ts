import type { User } from "@supabase/supabase-js";

export type WorkspaceBootstrapUser = Pick<User, "id" | "email" | "user_metadata">;

export function defaultWorkspaceIdentity(user: WorkspaceBootstrapUser) {
  const metadataName =
    typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name.trim()
      : "";
  const emailName = user.email?.split("@")[0]?.trim() || "My Workspace";
  const name = metadataName || emailName;
  const baseSlug =
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "workspace";

  return {
    name,
    slug: `${baseSlug}-${user.id.slice(0, 8)}`,
  };
}
