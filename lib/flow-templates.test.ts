import { describe, expect, it } from "vitest";
import {
  instagramFollowerGateTemplate,
  instagramFollowerRequiredTemplate,
} from "./flow-templates";

const CANVAS_NODE_TYPES = new Set([
  "trigger",
  "sendMessage",
  "condition",
  "delay",
  "action",
  "aiResponse",
]);

type MessageData = {
  messages: Array<{
    text: string;
    buttons: Array<{ type: string; title: string; payload?: string; url?: string }>;
  }>;
};

describe("instagramFollowerGateTemplate", () => {
  it("uses only canvas-supported node types and one correlated input wait", () => {
    const template = instagramFollowerGateTemplate();
    const byId = Object.fromEntries(template.nodes.map((node) => [node.id, node]));

    expect(template.nodes.every((node) => CANVAS_NODE_TYPES.has(node.type))).toBe(true);
    expect(byId["opening-wait"]).toMatchObject({
      type: "action",
      data: {
        actionType: "smartDelay",
        expectedPayload: "ZF_OPEN_{{session_id}}",
        acceptedText: ["link"],
      },
    });
    expect(byId["follower-condition"].data.conditions).toEqual([
      { field: "instagram_follower", operator: "equals", value: "true" },
    ]);
    expect(template.nodes.filter((node) => node.data.actionType === "smartDelay")).toHaveLength(1);
    expect(template.nodes.some((node) => node.type === "delay")).toBe(false);
  });

  it("binds the opening postback to the server-created session", () => {
    const template = instagramFollowerGateTemplate();
    const byId = Object.fromEntries(template.nodes.map((node) => [node.id, node]));
    const opening = byId.opening.data as MessageData;

    expect(opening.messages[0].buttons).toEqual([
      {
        type: "postback",
        title: "Quero receber",
        payload: "ZF_OPEN_{{session_id}}",
      },
    ]);
    expect(opening.messages[0].buttons).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "url" })]),
    );
  });

  it("delivers the identical promised URL on both follower branches", () => {
    const template = instagramFollowerGateTemplate();
    const byId = Object.fromEntries(template.nodes.map((node) => [node.id, node]));
    const follower = byId["follower-delivery"].data as MessageData;
    const nonFollower = byId["non-follower-delivery"].data as MessageData;

    for (const data of [follower, nonFollower]) {
      expect(data.messages[0].buttons).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "url",
            title: "Abrir Claude",
            url: "https://claude.ai/new",
          }),
        ]),
      );
    }
    expect(nonFollower.messages[0].text.toLowerCase()).toContain("opcional");
  });
});

describe("Instagram template profile references", () => {
  it("uses only the current @filipi.emilio profile", () => {
    const serialized = JSON.stringify([
      instagramFollowerGateTemplate(),
      instagramFollowerRequiredTemplate(),
    ]);

    expect(serialized).toContain("@filipi.emilio");
    expect(serialized).toContain("https://www.instagram.com/filipi.emilio/");
    expect(serialized).not.toContain("filipi.ia");
  });
});

describe("instagramFollowerRequiredTemplate", () => {
  it("matches the texto whisper reference flow: no preset keyword, blank link buttons, tuned retry timing", () => {
    const template = instagramFollowerRequiredTemplate();
    const byId = Object.fromEntries(template.nodes.map((node) => [node.id, node]));
    const opening = byId["required-opening"].data as MessageData;
    const profilePrompt = byId["follow-profile-prompt"].data as MessageData;
    const confirmationPrompt = byId["follow-confirmation-prompt"].data as MessageData;
    const initialDelivery = byId["initial-link-delivery"].data as MessageData;
    const requiredDelivery = byId["required-link-delivery"].data as MessageData;

    // The keyword is project-specific, so the template leaves it for the next
    // person to fill in rather than presetting one that would need editing anyway.
    expect(byId["required-trigger"].data.keywords).toEqual([]);
    expect(byId["required-trigger"].data.replyTexts).toHaveLength(3);
    expect(byId["required-trigger"].data.replyTexts).toEqual(
      expect.arrayContaining([expect.stringMatching(/dm/i)]),
    );

    expect(opening.messages[0].buttons).toEqual([
      {
        type: "postback",
        title: "Pode mandar!",
        payload: "ZF_OPEN_{{session_id}}",
      },
    ]);

    // Both delivery buttons are blank on purpose: every project promises a
    // different link, unlike the follow-profile button, which always points
    // at the same account and so keeps a real title and URL.
    for (const delivery of [initialDelivery, requiredDelivery]) {
      expect(delivery.messages[0].buttons).toEqual([{ type: "url", title: "", url: "" }]);
    }
    expect(profilePrompt.messages[0].buttons).toEqual([
      {
        type: "url",
        title: "Seguir Perfil",
        url: "https://www.instagram.com/filipi.emilio/",
      },
    ]);

    expect(byId["follow-profile-delay"]).toMatchObject({
      type: "delay",
      data: { duration: 15, unit: "seconds" },
    });
    expect(confirmationPrompt.messages[0].buttons).toEqual([
      {
        type: "postback",
        title: "Já segui",
        payload: "ZF_FOLLOWED_{{session_id}}",
      },
    ]);
    expect(byId["follow-wait"]).toMatchObject({
      type: "action",
      data: { actionType: "smartDelay", expectedPayload: "ZF_FOLLOWED_{{session_id}}" },
    });

    // The "confirming your follow" message node was cut from the reference
    // flow, so follow-wait resumes straight into the recheck sequence.
    expect(byId["follow-checking-feedback"]).toBeUndefined();
    expect(template.edges).toEqual(
      expect.arrayContaining([
        { id: "required-e9", source: "follow-wait", target: "follower-recheck-before-first" },
      ]),
    );

    for (const id of ["follower-recheck-1", "follower-recheck-2", "follower-recheck-3"]) {
      expect(byId[id].data).toMatchObject({
        conditionType: "instagram_follower",
        allowFollowerGatedContent: true,
      });
    }
    // 1/2/3-minute backoff: a 95-second window (5s/30s/1min) measured too
    // tight in production, failing all three checks for a contact who had
    // actually followed before Instagram's follower status caught up.
    expect(byId["follower-recheck-before-first"]).toMatchObject({
      type: "delay",
      data: { duration: 1, unit: "minutes" },
    });
    expect(byId["follower-recheck-delay-1"]).toMatchObject({
      type: "delay",
      data: { duration: 2, unit: "minutes" },
    });
    expect(byId["follower-recheck-delay-2"]).toMatchObject({
      type: "delay",
      data: { duration: 3, unit: "minutes" },
    });
    expect(byId["follower-not-confirmed"]).toBeDefined();

    expect(template.edges).toEqual(
      expect.arrayContaining([
        {
          id: "required-e5",
          source: "initial-follower-check",
          target: "follow-profile-prompt",
          sourceHandle: "false",
        },
        {
          id: "required-e11",
          source: "follower-recheck-1",
          target: "follower-recheck-delay-1",
          sourceHandle: "false",
        },
        {
          id: "required-e14",
          source: "follower-recheck-2",
          target: "follower-recheck-delay-2",
          sourceHandle: "false",
        },
        {
          id: "required-e17",
          source: "follower-recheck-3",
          target: "follower-not-confirmed",
          sourceHandle: "false",
        },
      ]),
    );
  });
});
