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
 * A later, session-bound confirmation starts a delayed verification
 * sequence — three attempts with a short backoff, absorbing follower-status
 * propagation delays from Instagram/Zernio — while keeping the promised
 * link gated on a positive live check.
 */
export function instagramFollowerRequiredTemplate(): InstagramFollowerTemplate {
  const verifiedFollowerCondition = {
    ...followerCondition,
    allowFollowerGatedContent: true,
  };

  // Left blank on purpose: each project promises a different link, so the
  // next person to use this template fills in both before publishing.
  const blankLink = { type: "url", title: "", url: "" };

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
      {
        id: "follow-profile-prompt",
        type: "sendMessage",
        position: { x: 700, y: 700 },
        data: {
          label: "Abrir perfil para seguir",
          messages: [{
            text: "Opa, fui ver aqui e tu ainda não me segue 😅\n\nMe dá essa moral aí que já te mando 👊",
            // Instagram rejects button labels over 20 characters and aborts the send.
            buttons: [{ type: "url", title: "Seguir Perfil", url: "https://www.instagram.com/filipi.emilio/" }],
          }],
        },
      },
      {
        id: "follow-profile-delay",
        type: "delay",
        position: { x: 700, y: 880 },
        data: { label: "Aguardar retorno do perfil", duration: 15, unit: "seconds" },
      },
      {
        id: "follow-confirmation-prompt",
        type: "sendMessage",
        position: { x: 700, y: 1060 },
        data: {
          label: "Pedir confirmação de follow",
          messages: [{
            text: "Se já seguiu toca no botão aqui abaixo pra eu liberar o link 👇",
            buttons: [{ type: "postback", title: "Já segui", payload: "ZF_FOLLOWED_{{session_id}}" }],
          }],
        },
      },
      {
        id: "follow-wait",
        type: "action",
        position: { x: 700, y: 1240 },
        data: {
          label: "Aguardar botão “Já segui”",
          actionType: "smartDelay",
          expectedPayload: "ZF_FOLLOWED_{{session_id}}",
          timeout: 1440,
          timeoutUnit: "minutes",
        },
      },
      {
        id: "follower-recheck-before-first",
        type: "delay",
        position: { x: 700, y: 1420 },
        data: { label: "Aguardar sincronização inicial", duration: 5, unit: "seconds" },
      },
      {
        id: "follower-recheck-1",
        type: "condition",
        position: { x: 700, y: 1600 },
        data: { label: "Confirmar follow — tentativa 1", ...verifiedFollowerCondition },
      },
      {
        id: "follower-recheck-delay-1",
        type: "delay",
        position: { x: 1000, y: 1780 },
        data: { duration: 30, unit: "seconds" },
      },
      {
        id: "follower-recheck-2",
        type: "condition",
        position: { x: 1000, y: 1960 },
        data: { label: "Confirmar follow — tentativa 2", ...verifiedFollowerCondition },
      },
      {
        id: "follower-recheck-delay-2",
        type: "delay",
        position: { x: 1000, y: 2140 },
        data: { label: "Aguardar sincronização final", duration: 1, unit: "minutes" },
      },
      {
        id: "follower-recheck-3",
        type: "condition",
        position: { x: 1000, y: 2320 },
        data: { label: "Confirmar follow — tentativa 3", ...verifiedFollowerCondition },
      },
      {
        id: "required-link-delivery",
        type: "sendMessage",
        position: { x: 400, y: 2500 },
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
        position: { x: 1300, y: 2500 },
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
      { id: "required-e6", source: "follow-profile-prompt", target: "follow-profile-delay" },
      { id: "required-e7", source: "follow-profile-delay", target: "follow-confirmation-prompt" },
      { id: "required-e8", source: "follow-confirmation-prompt", target: "follow-wait" },
      { id: "required-e9", source: "follow-wait", target: "follower-recheck-before-first" },
      { id: "required-e10", source: "follower-recheck-before-first", target: "follower-recheck-1" },
      { id: "required-e11", source: "follower-recheck-1", target: "follower-recheck-delay-1", sourceHandle: "false" },
      { id: "required-e12", source: "follower-recheck-delay-1", target: "follower-recheck-2" },
      { id: "required-e13", source: "follower-recheck-1", target: "required-link-delivery", sourceHandle: "true" },
      { id: "required-e14", source: "follower-recheck-2", target: "follower-recheck-delay-2", sourceHandle: "false" },
      { id: "required-e15", source: "follower-recheck-delay-2", target: "follower-recheck-3" },
      { id: "required-e16", source: "follower-recheck-2", target: "required-link-delivery", sourceHandle: "true" },
      { id: "required-e17", source: "follower-recheck-3", target: "follower-not-confirmed", sourceHandle: "false" },
      { id: "required-e18", source: "follower-recheck-3", target: "required-link-delivery", sourceHandle: "true" },
    ],
  };
}
