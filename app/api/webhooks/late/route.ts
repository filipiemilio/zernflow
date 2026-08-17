import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { executeFlow, resumeSession } from "@/lib/flow-engine/engine";
import { matchesWaitingSessionInput } from "@/lib/flow-engine/session-input";
import { matchTrigger } from "@/lib/flow-engine/trigger-matcher";
import { resolveWebhookSecret, verifyWebhookSignature } from "@/lib/zernio-webhook";
import { upsertContactForSender } from "@/lib/inbox-sync";
import { processComment } from "@/lib/comment-processor";
import {
  isOptInText,
  isOptOutText,
  isStandardMessagingWindowOpen,
} from "@/lib/automation-safety";
import type { Database, Json } from "@/lib/types/database";

// ── Zernio API webhook payload ───────────────────────────────────────────────

interface WebhookPayload {
  id?: string;
  event: string;
  message: {
    id: string;
    conversationId: string;
    platform: string;
    platformMessageId: string;
    direction: string;
    text: string | null;
    attachments: Array<{ type: string; url: string; payload?: string }>;
    sender: {
      id: string;
      name: string;
      username: string | null;
      picture: string | null;
      instagramProfile?: {
        isFollower?: boolean | null;
        isFollowing?: boolean | null;
      } | null;
    };
    sentAt: string;
    isRead: boolean;
  };
  conversation: {
    id: string;
    platformConversationId: string | null;
    participantId: string;
    participantName: string;
    participantUsername: string | null;
    participantPicture: string | null;
    status: string;
  };
  account: {
    id: string;
    platform: string;
    username: string;
    displayName: string;
  };
  metadata?: {
    quickReplyPayload?: string;
    callbackData?: string;
    postbackPayload?: string;
    postbackTitle?: string;
  };
  timestamp: string;
}

interface CommentWebhookPayload {
  id?: string;
  event: string;
  comment: {
    id: string;
    /** Zernio post ID; null when the comment is on a post not published through Zernio. */
    postId: string | null;
    platformPostId: string;
    platform: string;
    text: string;
    author: { id: string; username?: string; name?: string; picture?: string };
    createdAt: string;
    isReply: boolean;
    parentCommentId: string | null;
  };
  post: { id: string; platformPostId: string };
  account: { id: string; platform: string; username: string };
  timestamp: string;
}

// ── Webhook handler ─────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    return await handleWebhook(request);
  } catch (err) {
    console.error("Webhook handler error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * Claim an event id for processing. Returns false when another delivery of the
 * same event already claimed it (Zernio retries with the same id), so retries
 * and redeliveries never re-run a flow. Events without an id are processed
 * unconditionally rather than dropped.
 */
async function claimWebhookEvent(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  eventId: string | null | undefined
): Promise<boolean> {
  if (!eventId) {
    throw new Error("Webhook event has no stable id");
  }
  const { error } = await supabase
    .from("webhook_events")
    .insert({ event_id: eventId });
  if (!error) return true;
  if (error.code === "23505") return false;
  // Failing open here permits the original delivery and every retry to execute
  // during a DB incident. Return 5xx instead so Zernio retries after durability
  // is restored, without multiplying Instagram side effects.
  throw new Error(`Webhook event claim failed: ${error.message}`);
}

async function handleWebhook(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("x-late-signature");
  const headerEventId = request.headers.get("x-late-event-id");

  let parsed: { event?: string; id?: string };
  try {
    parsed = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const rawEventId =
    parsed.id ||
    headerEventId ||
    (parsed as { message?: { id?: string } }).message?.id ||
    (parsed as { comment?: { id?: string } }).comment?.id;
  const accountId = (parsed as { account?: { id?: string } }).account?.id || "unknown";
  const eventId = rawEventId ? `${parsed.event}:${accountId}:${rawEventId}` : null;

  if (parsed.event === "comment.received") {
    return handleCommentWebhook(parsed as CommentWebhookPayload, body, signature, eventId);
  }

  // Everything else besides message.received is acknowledged and ignored
  if (parsed.event !== "message.received") {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const payload = parsed as WebhookPayload;

  const { message: msg, account } = payload;

  // Ignore outbound messages (sent by the bot itself) to prevent loops
  if (msg.direction === "outbound") {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const supabase = await createServiceClient();

  // Look up channel by late_account_id
  const { data: channel } = await supabase
    .from("channels")
    .select("*")
    .eq("late_account_id", account.id)
    .eq("is_active", true)
    .single();

  if (!channel) {
    return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  }

  // Prevent loops: if the sender is another connected account in this
  // workspace, skip. This happens when both sides of a DM conversation
  // are connected (e.g. during testing).
  if (msg.sender.username) {
    const { data: senderChannel } = await supabase
      .from("channels")
      .select("id")
      .eq("workspace_id", channel.workspace_id)
      .eq("username", msg.sender.username)
      .eq("is_active", true)
      .maybeSingle();

    if (senderChannel) {
      return NextResponse.json({ ok: true, skipped: true, reason: "sender_is_own_account" });
    }
  }

  // Verify HMAC-SHA256 signature against the workspace-level secret
  // (falls back to the legacy per-channel secret during transition).
  const secret = await resolveWebhookSecret(supabase, channel);
  if (!secret) {
    console.error(`Webhook secret missing for workspace ${channel.workspace_id}`);
    return NextResponse.json({ error: "Webhook verification unavailable" }, { status: 503 });
  }
  if (!verifyWebhookSignature(secret, body, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  if (!(await claimWebhookEvent(supabase, eventId))) {
    return NextResponse.json({ ok: true, skipped: true, reason: "duplicate_event" });
  }

  // Ack immediately and process after the response: Zernio aborts deliveries
  // at 5s and retries, so contact upserts + flow execution (Zernio sends, AI
  // nodes) must never run before the 200 goes out.
  after(async () => {
    try {
      await processMessageEvent(supabase, payload, channel);
    } catch (err) {
      console.error("Webhook message processing error:", err);
    }
  });

  return NextResponse.json({ ok: true, queued: true });
}

async function processMessageEvent(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  payload: WebhookPayload,
  channel: Database["public"]["Tables"]["channels"]["Row"],
) {
  const { message: msg, conversation: conv, account, metadata } = payload;

  // ── Upsert contact ───────────────────────────────────────────────────────

  const senderId = msg.sender.id;
  const senderName = msg.sender.name || msg.sender.username || senderId;
  const parsedSentAt = Date.parse(msg.sentAt);
  const interactionAt =
    Number.isFinite(parsedSentAt) && parsedSentAt <= Date.now() + 5 * 60 * 1000
      ? new Date(parsedSentAt).toISOString()
      : new Date().toISOString();

  const contact = await upsertContactForSender({
    supabase,
    channel,
    senderId,
    senderName,
    senderPicture: msg.sender.picture || null,
    senderUsername: msg.sender.username || null,
    interactionAt,
  });

  if (!contact) {
    console.error("Failed to create contact for webhook message");
    return;
  }

  const contactId = contact.contactId;

  // Only a verified inbound DM/quick reply/postback opens Instagram's standard
  // messaging window. Comment events never write this marker. Store the provider
  // timestamp rather than webhook receipt time so delayed/replayed events cannot
  // manufacture a fresh 24-hour window.
  const { data: contactState } = await supabase
    .from("contacts")
    .select("metadata")
    .eq("id", contactId)
    .single();
  const existingMetadata =
    contactState?.metadata && typeof contactState.metadata === "object" && !Array.isArray(contactState.metadata)
      ? (contactState.metadata as Record<string, Json | undefined>)
      : {};
  await supabase
    .from("contacts")
    .update({
      last_interaction_at: interactionAt,
      metadata: {
        ...existingMetadata,
        instagram_last_user_interaction_at: interactionAt,
      } as Json,
    })
    .eq("id", contactId);

  // ── Upsert conversation ──────────────────────────────────────────────────

  const messagePreview = (msg.text || "").slice(0, 100);

  const { data: conversation } = await supabase
    .from("conversations")
    .upsert(
      {
        workspace_id: channel.workspace_id,
        channel_id: channel.id,
        contact_id: contactId,
        platform: channel.platform,
        late_conversation_id: conv.id,
        status: "open",
        last_message_at: new Date().toISOString(),
        last_message_preview: messagePreview,
        unread_count: 1,
      },
      { onConflict: "channel_id,contact_id" }
    )
    .select("id, is_automation_paused")
    .single();

  if (!conversation) {
    console.error("Failed to upsert conversation for webhook message");
    return;
  }

  if (contact.existed) {
    await supabase
      .rpc("increment_unread", {
        conv_id: conversation.id,
        preview: messagePreview,
      })
      .then(() => {});
  }

  // Messages are stored by Zernio (source of truth) — no local insert needed.

  // ── Flow engine ───────────────────────────────────────────────────────────

  const incomingMessage = {
    text: msg.text || undefined,
    postbackPayload: metadata?.postbackPayload || undefined,
    quickReplyPayload: metadata?.quickReplyPayload || undefined,
    callbackData: metadata?.callbackData || undefined,
    sender: {
      id: msg.sender.id,
      name: msg.sender.name,
      username: msg.sender.username || undefined,
      instagramProfile: msg.sender.instagramProfile || undefined,
    },
  };

  // Opt-out is mandatory even while human takeover has paused automation.
  const handled = await handleGlobalKeywords(
    supabase,
    channel.workspace_id,
    contactId,
    msg.text || undefined,
  );
  if (handled || conversation.is_automation_paused) return;

  const { data: subscription } = await supabase
    .from("contacts")
    .select("is_subscribed")
    .eq("id", contactId)
    .single();
  if (!subscription?.is_subscribed) return;

  // Old/replayed inbound events are still synced to Inbox and can opt out, but
  // cannot open/resume an automation or manufacture a new 24-hour window.
  if (!isStandardMessagingWindowOpen(interactionAt)) return;

  const { data: waitingSessions } = await supabase
    .from("flow_sessions")
    .select("*")
    .eq("contact_id", contactId)
    .eq("channel_id", channel.id)
    .eq("status", "active")
    .eq("waiting_for_input", true)
    .order("created_at", { ascending: false })
    .limit(10);

  const waitingSession = waitingSessions?.[0];
  if (waitingSession) {
    // Only one input wait per contact/channel is supported. Settle any legacy
    // extras deterministically instead of routing one reply arbitrarily.
    const staleIds = (waitingSessions ?? []).slice(1).map((session) => session.id);
    if (staleIds.length > 0) {
      await supabase
        .from("flow_sessions")
        .update({ status: "cancelled", waiting_for_input: false })
        .in("id", staleIds);
    }

    const { data: waitingFlow } = await supabase
      .from("flows")
      .select("nodes")
      .eq("id", waitingSession.flow_id)
      .single();
    const nodes = Array.isArray(waitingFlow?.nodes)
      ? (waitingFlow.nodes as Array<{ id: string; data?: Record<string, unknown> }>)
      : [];
    if (!matchesWaitingSessionInput(waitingSession, nodes, incomingMessage)) {
      console.warn(`Inbound interaction did not match waiting session ${waitingSession.id}`);
      return;
    }

    try {
      await resumeSession(supabase, waitingSession, {
        triggerId: "session_resume",
        flowId: waitingSession.flow_id,
        channelId: channel.id,
        contactId,
        conversationId: conversation.id,
        workspaceId: channel.workspace_id,
        incomingMessage,
        lateConversationId: conv.id,
        lateAccountId: account.id,
      });
    } catch (err) {
      console.error("Flow session resume error:", err);
    }
    return;
  }

  const trigger = await matchTrigger(supabase, {
    channelId: channel.id,
    workspaceId: channel.workspace_id,
    conversationId: conversation.id,
    message: incomingMessage,
    isFirstMessage: !contact.existed,
  });
  if (trigger) {
    try {
      await executeFlow(supabase, {
        triggerId: trigger.id,
        flowId: trigger.flow_id,
        channelId: channel.id,
        contactId,
        conversationId: conversation.id,
        workspaceId: channel.workspace_id,
        incomingMessage,
        lateConversationId: conv.id,
        lateAccountId: account.id,
      });
    } catch (err) {
      console.error("Flow execution error:", err);
    }
  }
}

// ── Comment webhook ─────────────────────────────────────────────────────────

async function handleCommentWebhook(
  payload: CommentWebhookPayload,
  rawBody: string,
  signature: string | null,
  eventId: string | null | undefined
) {
  const supabase = await createServiceClient();

  const { data: channel } = await supabase
    .from("channels")
    .select("*")
    .eq("late_account_id", payload.account.id)
    .eq("is_active", true)
    .single();

  if (!channel) {
    return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  }

  // Prevent loops: our own comments (e.g. the configured public reply) also
  // arrive as comment.received and must never re-trigger a flow.
  if (
    payload.comment.author?.username &&
    payload.comment.author.username === channel.username
  ) {
    return NextResponse.json({ ok: true, skipped: true, reason: "own_comment" });
  }

  const secret = await resolveWebhookSecret(supabase, channel);
  if (!secret) {
    console.error(`Webhook secret missing for workspace ${channel.workspace_id}`);
    return NextResponse.json({ error: "Webhook verification unavailable" }, { status: 503 });
  }
  if (!verifyWebhookSignature(secret, rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  if (!(await claimWebhookEvent(supabase, eventId))) {
    return NextResponse.json({ ok: true, skipped: true, reason: "duplicate_event" });
  }

  // Ack before processing (same 5s delivery budget as messages); processComment
  // additionally dedupes on (channel_id, platform_comment_id) so cross-event
  // redeliveries of the same comment stay one-shot.
  after(async () => {
    try {
      await processComment({
        supabase,
        channel,
        comment: {
          id: payload.comment.id,
          // Native posts (not published through Zernio) have a null postId; fall
          // back to the platform post id so flows still run. Zernio's private-reply
          // endpoint only needs the comment id, so the placeholder is harmless.
          postId: payload.comment.postId || payload.comment.platformPostId,
          text: payload.comment.text,
          createdAt: payload.comment.createdAt,
          isReply: payload.comment.isReply,
          parentCommentId: payload.comment.parentCommentId,
          author: payload.comment.author,
        },
      });
    } catch (err) {
      console.error("Webhook comment processing error:", err);
    }
  });

  return NextResponse.json({ ok: true, queued: true });
}

// ── Global keywords ─────────────────────────────────────────────────────────

async function suppressContactAutomation(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  contactId: string,
) {
  await Promise.all([
    supabase
      .from("contacts")
      .update({ is_subscribed: false })
      .eq("id", contactId),
    supabase
      .from("flow_sessions")
      .update({ status: "cancelled", waiting_for_input: false })
      .eq("contact_id", contactId)
      .eq("status", "active"),
    supabase
      .from("sequence_enrollments")
      .update({ status: "cancelled" })
      .eq("contact_id", contactId)
      .eq("status", "active"),
    supabase
      .from("scheduled_jobs")
      .update({ status: "failed", last_error: "Contact opted out" })
      .contains("payload", { contactId })
      .in("status", ["pending", "processing"]),
  ]);
}

async function handleGlobalKeywords(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  workspaceId: string,
  contactId: string,
  text: string | undefined
): Promise<boolean> {
  if (!text) return false;

  // Mandatory system commands cannot be removed by workspace configuration.
  if (isOptOutText(text)) {
    await suppressContactAutomation(supabase, contactId);
    return true;
  }
  if (isOptInText(text)) {
    await supabase.from("contacts").update({ is_subscribed: true }).eq("id", contactId);
    return true;
  }

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("global_keywords")
    .eq("id", workspaceId)
    .single();

  // Historical rows may contain action objects while the settings UI stores
  // strings. Inspect defensively; plain strings are flow keywords, not actions.
  const keywords = Array.isArray(workspace?.global_keywords)
    ? workspace.global_keywords
    : [];
  const normalizedText = text.toLocaleLowerCase("pt-BR").trim();

  for (const value of keywords) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const keyword = (value as Record<string, unknown>).keyword;
    const action = (value as Record<string, unknown>).action;
    if (typeof keyword !== "string" || normalizedText !== keyword.toLocaleLowerCase("pt-BR")) {
      continue;
    }
    if (action === "unsubscribe") {
      await suppressContactAutomation(supabase, contactId);
      return true;
    }
    if (action === "subscribe") {
      await supabase.from("contacts").update({ is_subscribed: true }).eq("id", contactId);
      return true;
    }
  }

  return false;
}
