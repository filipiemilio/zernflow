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
 * Explicit opt-in follower gate based on the safe template's opening flow.
 * The first session-bound reply checks whether the user already follows. Only
 * non-followers are prompted to follow; their second session-bound reply is
 * checked again before the promised URL is delivered. A failed recheck ends
 * silently without sending the link.
 */
export function instagramFollowerRequiredTemplate(): InstagramFollowerTemplate {
  return {
    nodes: [
      {
        id: "required-trigger",
        type: "trigger",
        position: { x: 400, y: 0 },
        data: {
          label: "Comment Keyword",
          triggerType: "comment_keyword",
          keywords: [{ value: "claude", matchType: "contains" }],
        },
      },
      {
        id: "required-opening",
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
        id: "required-opening-wait",
        type: "action",
        position: { x: 400, y: 330 },
        data: {
          label: "Aguardar “Quero receber” ou LINK",
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
        data: {
          label: "Já segue o perfil?",
          ...followerCondition,
        },
      },
      {
        id: "initial-link-delivery",
        type: "sendMessage",
        position: { x: 100, y: 700 },
        data: {
          label: "Já seguia → enviar link",
          messages: [
            {
              text: "Obrigado por acompanhar o perfil! Aqui está o link prometido 🚀",
              buttons: [promisedLink],
            },
          ],
        },
      },
      {
        id: "follow-prompt",
        type: "sendMessage",
        position: { x: 700, y: 700 },
        data: {
          label: "Ainda não segue → pedir follow",
          messages: [
            {
              text: "Antes de liberar o link, siga @filipi.emilio e depois toque em “Já segui” para eu verificar 👇",
              buttons: [
                {
                  type: "url",
                  title: "Seguir perfil",
                  url: "https://www.instagram.com/filipi.emilio/",
                },
                {
                  type: "postback",
                  title: "Já segui",
                  payload: "ZF_FOLLOWED_{{session_id}}",
                },
              ],
            },
          ],
        },
      },
      {
        id: "follow-wait",
        type: "action",
        position: { x: 700, y: 880 },
        data: {
          label: "Aguardar botão “Já segui”",
          actionType: "smartDelay",
          expectedPayload: "ZF_FOLLOWED_{{session_id}}",
          timeout: 1440,
          timeoutUnit: "minutes",
        },
      },
      {
        id: "follower-recheck",
        type: "condition",
        position: { x: 700, y: 1060 },
        data: {
          label: "Verificar novamente se segue o perfil",
          ...followerCondition,
          allowFollowerGatedContent: true,
        },
      },
      {
        id: "required-link-delivery",
        type: "sendMessage",
        position: { x: 450, y: 1240 },
        data: {
          label: "Follow confirmado → enviar link",
          messages: [
            {
              text: "Follow confirmado ✅ Aqui está o link prometido:",
              buttons: [promisedLink],
            },
          ],
        },
      },
    ],
    edges: [
      { id: "required-e1", source: "required-trigger", target: "required-opening" },
      { id: "required-e2", source: "required-opening", target: "required-opening-wait" },
      { id: "required-e3", source: "required-opening-wait", target: "initial-follower-check" },
      {
        id: "required-e4",
        source: "initial-follower-check",
        target: "initial-link-delivery",
        sourceHandle: "true",
      },
      {
        id: "required-e5",
        source: "initial-follower-check",
        target: "follow-prompt",
        sourceHandle: "false",
      },
      { id: "required-e6", source: "follow-prompt", target: "follow-wait" },
      { id: "required-e7", source: "follow-wait", target: "follower-recheck" },
      {
        id: "required-e8",
        source: "follower-recheck",
        target: "required-link-delivery",
        sourceHandle: "true",
      },
    ],
  };
}
