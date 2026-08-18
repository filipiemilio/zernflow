export interface InstagramFollowerTemplateNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

export interface InstagramFollowerTemplateEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
}

export interface InstagramFollowerTemplate {
  nodes: InstagramFollowerTemplateNode[];
  edges: InstagramFollowerTemplateEdge[];
}

const followerCondition = {
  conditionType: "instagram_follower",
  conditions: [
    { field: "instagram_follower", operator: "equals", value: "true" },
  ],
  logic: "and",
};

const promisedLink = {
  type: "url",
  title: "Abrir Claude",
  url: "https://claude.ai/new",
};

/**
 * Policy-safe Instagram comment-to-DM template.
 *
 * Follower status personalizes the message but never gates the content promised
 * in the post. Both condition branches deliver the same URL after a verified
 * conversational opt-in; the non-follower branch contains only an optional
 * invitation to follow.
 */
export function instagramFollowerGateTemplate(): InstagramFollowerTemplate {
  return {
    nodes: [
      {
        id: "trigger",
        type: "trigger",
        position: { x: 400, y: 0 },
        data: {
          label: "Comment Keyword",
          triggerType: "comment_keyword",
          keywords: [{ value: "claude", matchType: "contains" }],
        },
      },
      {
        id: "opening",
        type: "sendMessage",
        position: { x: 400, y: 160 },
        data: {
          label: "Opening DM",
          messages: [
            {
              text: "Oi! Posso enviar o link prometido? Toque abaixo para continuar 👇 Se estiver no computador, responda LINK.",
              buttons: [
                {
                  type: "postback",
                  title: "Quero receber",
                  payload: "ZF_OPEN_{{session_id}}",
                },
              ],
            },
          ],
        },
      },
      {
        id: "opening-wait",
        type: "action",
        position: { x: 400, y: 330 },
        data: {
          label: "Wait for “Quero receber” or LINK",
          actionType: "smartDelay",
          expectedPayload: "ZF_OPEN_{{session_id}}",
          acceptedText: ["link"],
          timeout: 1440,
          timeoutUnit: "minutes",
        },
      },
      {
        id: "follower-condition",
        type: "condition",
        position: { x: 400, y: 500 },
        data: {
          label: "Personalize: Is Instagram Follower?",
          ...followerCondition,
        },
      },
      {
        id: "follower-delivery",
        type: "sendMessage",
        position: { x: 100, y: 700 },
        data: {
          label: "Follower → Deliver Promised Link",
          messages: [
            {
              text: "Obrigado por acompanhar o perfil! Aqui está o link prometido 🚀",
              buttons: [promisedLink],
            },
          ],
        },
      },
      {
        id: "non-follower-delivery",
        type: "sendMessage",
        position: { x: 700, y: 700 },
        data: {
          label: "Not Follower → Deliver + Optional Invite",
          messages: [
            {
              text: "Aqui está o link prometido 🚀 Se o conteúdo ajudar, fique à vontade para seguir @filipi.emilio — é opcional.",
              buttons: [
                promisedLink,
                {
                  type: "url",
                  title: "Ver @filipi.emilio",
                  url: "https://www.instagram.com/filipi.emilio/",
                },
              ],
            },
          ],
        },
      },
    ],
    edges: [
      { id: "e1", source: "trigger", target: "opening" },
      { id: "e2", source: "opening", target: "opening-wait" },
      { id: "e3", source: "opening-wait", target: "follower-condition" },
      {
        id: "e4",
        source: "follower-condition",
        target: "follower-delivery",
        sourceHandle: "true",
      },
      {
        id: "e5",
        source: "follower-condition",
        target: "non-follower-delivery",
        sourceHandle: "false",
      },
    ],
  };
}

/**
 * Explicit opt-in Instagram comment-to-DM follower gate.
 *
 * Mirrors the "texto whisper" flow, the working reference this template was
 * cloned from: same node graph, wait/retry timing and UX copy, but with the
 * keyword and the two delivered-link buttons left blank for the next
 * project to fill in. A non-follower first receives only the profile link.
 *
 * The gate is entirely tap-driven and carries no delay nodes. Measured over
 * 86 real sessions of the reference flow, the live follower check confirms a
 * genuine follow a median of 1 second after the contact taps — 25 of 25
 * confirmations landed on the very first check, none ever needed a retry.
 * Propagation is therefore not what a clock was ever buying; every fixed
 * delay only held fast contacts hostage to the slowest case, and the
 * cron's one-minute granularity meant a "15 second" wait really ran 22–72s.
 *
 * So the prompt ships both buttons at once and the flow simply waits. A url
 * button fires no webhook, so the contact's own tap is the only signal that
 * they are back, which makes it the only mechanism that can move at each
 * person's pace. A negative check resends the same prompt rather than
 * escalating: tapping "Já segui" early costs a second and a retry instead of
 * a wait, and the check — not the button order — is what actually gates the
 * link, so it cannot be cheated either way.
 */
export function instagramFollowerRequiredTemplate(): InstagramFollowerTemplate {
  const verifiedFollowerCondition = {
    ...followerCondition,
    allowFollowerGatedContent: true,
  };

  // Left blank on purpose: each project promises a different link, so the
  // next person to use this template fills in both before publishing.
  const blankLink = { type: "url", title: "", url: "" };

  // One message reused by the first prompt and both retries. Instagram caps
  // button labels at 20 characters and allows at most three per message.
  const followGateMessage = {
    text: "Opa, fui ver aqui e tu ainda não me segue 😅\n\nMe dá essa moral aí que já te mando 👊",
    buttons: [
      { type: "url", title: "Seguir Perfil", url: "https://www.instagram.com/filipi.emilio/" },
      { type: "postback", title: "Já segui", payload: "ZF_FOLLOWED_{{session_id}}" },
    ],
  };

  // Every wait listens for the same payload, so a tap on any of the prompts
  // still advances whichever wait the session is currently parked on.
  const followWaitData = {
    label: "Aguardar toque em “Já segui”",
    actionType: "smartDelay",
    expectedPayload: "ZF_FOLLOWED_{{session_id}}",
    timeout: 1440,
    timeoutUnit: "minutes",
  };

  return {
    nodes: [
      {
        id: "required-trigger",
        type: "trigger",
        position: { x: 400, y: 0 },
        data: {
          label: "Comentário com palavra-chave",
          triggerType: "comment_keyword",
          keywords: [],
          replyTexts: [
            "Dá uma olhada no seu DM.",
            "Opa, confere no DM e veja se foi.",
            "Confere seu DM, já enviei.",
          ],
        },
      },
      {
        id: "required-opening",
        type: "sendMessage",
        position: { x: 400, y: 160 },
        data: {
          label: "Mensagem privada do comentário",
          messages: [{
            text: "Oi! Você comentou aqui, vou te mandar o link por aqui 👇.",
            buttons: [{ type: "postback", title: "Pode mandar!", payload: "ZF_OPEN_{{session_id}}" }],
          }],
        },
      },
      {
        id: "required-opening-wait",
        type: "action",
        position: { x: 400, y: 330 },
        data: {
          label: "Aguardar “Pode mandar!” ou LINK",
          actionType: "smartDelay",
          expectedPayload: "ZF_OPEN_{{session_id}}",
          acceptedText: ["link"],
          timeout: 1440,
          timeoutUnit: "minutes",
        },
      },
      {
        id: "initial-follower-check",
        type: "condition",
        position: { x: 400, y: 500 },
        data: { label: "Já segue o perfil?", ...followerCondition },
      },
      {
        id: "initial-link-delivery",
        type: "sendMessage",
        position: { x: 100, y: 700 },
        data: {
          label: "Já seguia → enviar link",
          messages: [{
            text: "Obrigado por acompanhar o perfil! Aqui está o link prometido 🚀",
            buttons: [{ ...blankLink }],
          }],
        },
      },
      // The gate prompt carries both buttons at once. A url button fires no
      // webhook, so the contact's tap on "Já segui" is the only signal that
      // they are back — putting it here from the start is what lets the flow
      // move at each person's own pace instead of on a fixed clock.
      {
        id: "follow-profile-prompt",
        type: "sendMessage",
        position: { x: 700, y: 700 },
        data: {
          label: "Pedir follow",
          messages: [{ ...followGateMessage }],
        },
      },
      {
        id: "follow-wait",
        type: "action",
        position: { x: 700, y: 880 },
        data: { ...followWaitData },
      },
      {
        id: "follower-recheck-1",
        type: "condition",
        position: { x: 700, y: 1040 },
        data: { label: "Confirmar follow — 1ª", ...verifiedFollowerCondition },
      },
      {
        // A negative check resends the same prompt rather than a new one, so a
        // premature tap costs a second, not a wait: follow, tap again, done.
        id: "follow-retry-prompt-1",
        type: "sendMessage",
        position: { x: 700, y: 1200 },
        data: {
          label: "Não confirmou → reenviar",
          messages: [{ ...followGateMessage }],
        },
      },
      {
        id: "follow-wait-2",
        type: "action",
        position: { x: 700, y: 1360 },
        data: { ...followWaitData },
      },
      {
        id: "follower-recheck-2",
        type: "condition",
        position: { x: 700, y: 1520 },
        data: { label: "Confirmar follow — 2ª", ...verifiedFollowerCondition },
      },
      {
        id: "follow-retry-prompt-2",
        type: "sendMessage",
        position: { x: 700, y: 1680 },
        data: {
          label: "Não confirmou → reenviar",
          messages: [{ ...followGateMessage }],
        },
      },
      {
        id: "follow-wait-3",
        type: "action",
        position: { x: 700, y: 1840 },
        data: { ...followWaitData },
      },
      {
        id: "follower-recheck-3",
        type: "condition",
        position: { x: 700, y: 2000 },
        data: { label: "Confirmar follow — 3ª", ...verifiedFollowerCondition },
      },
      {
        id: "required-link-delivery",
        type: "sendMessage",
        position: { x: 350, y: 2180 },
        data: {
          label: "Follow confirmado → enviar link",
          messages: [{
            text: "Follow confirmado ✅ Aqui está o link prometido:",
            buttons: [{ ...blankLink }],
          }],
        },
      },
      {
        id: "follower-not-confirmed",
        type: "sendMessage",
        position: { x: 1050, y: 2180 },
        data: {
          label: "Follow ainda não confirmado",
          messages: [{
            text: "Ainda não consegui confirmar o follow pelo Instagram. Se você acabou de seguir, pode haver um atraso de atualização; tente novamente mais tarde.",
          }],
        },
      },
    ],
    edges: [
      { id: "required-e1", source: "required-trigger", target: "required-opening" },
      { id: "required-e2", source: "required-opening", target: "required-opening-wait" },
      { id: "required-e3", source: "required-opening-wait", target: "initial-follower-check" },
      { id: "required-e4", source: "initial-follower-check", target: "initial-link-delivery", sourceHandle: "true" },
      { id: "required-e5", source: "initial-follower-check", target: "follow-profile-prompt", sourceHandle: "false" },
      { id: "required-e6", source: "follow-profile-prompt", target: "follow-wait" },
      { id: "required-e7", source: "follow-wait", target: "follower-recheck-1" },
      { id: "required-e8", source: "follower-recheck-1", target: "required-link-delivery", sourceHandle: "true" },
      { id: "required-e9", source: "follower-recheck-1", target: "follow-retry-prompt-1", sourceHandle: "false" },
      { id: "required-e10", source: "follow-retry-prompt-1", target: "follow-wait-2" },
      { id: "required-e11", source: "follow-wait-2", target: "follower-recheck-2" },
      { id: "required-e12", source: "follower-recheck-2", target: "required-link-delivery", sourceHandle: "true" },
      { id: "required-e13", source: "follower-recheck-2", target: "follow-retry-prompt-2", sourceHandle: "false" },
      { id: "required-e14", source: "follow-retry-prompt-2", target: "follow-wait-3" },
      { id: "required-e15", source: "follow-wait-3", target: "follower-recheck-3" },
      { id: "required-e16", source: "follower-recheck-3", target: "required-link-delivery", sourceHandle: "true" },
      { id: "required-e17", source: "follower-recheck-3", target: "follower-not-confirmed", sourceHandle: "false" },
    ],
  };
}
