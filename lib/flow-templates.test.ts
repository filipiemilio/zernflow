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
  it("requires a profile visit step and retries follower verification before ending", () => {
    const template = instagramFollowerRequiredTemplate();
    const byId = Object.fromEntries(template.nodes.map((node) => [node.id, node]));
    const opening = byId["required-opening"].data as MessageData;
    const profilePrompt = byId["follow-profile-prompt"].data as MessageData;
    const confirmationPrompt = byId["follow-confirmation-prompt"].data as MessageData;

    expect(opening.messages[0].buttons).toEqual([
      {
        type: "postback",
        title: "Quero receber",
        payload: "ZF_OPEN_{{session_id}}",
      },
    ]);
    expect(profilePrompt.messages[0].buttons).toEqual([
      {
        type: "url",
        title: "Abrir perfil",
        url: "https://www.instagram.com/filipi.emilio/",
      },
    ]);
    expect(byId["required-trigger"].data.replyTexts).toHaveLength(3);
    expect(byId["required-trigger"].data.replyTexts).toEqual(
      expect.arrayContaining([expect.stringMatching(/dm/i)]),
    );
    expect(byId["follow-profile-delay"]).toMatchObject({
      type: "delay",
      data: { duration: 1, unit: "minutes" },
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

    for (const id of ["follower-recheck-1", "follower-recheck-2", "follower-recheck-3"]) {
      expect(byId[id].data).toMatchObject({
        conditionType: "instagram_follower",
        allowFollowerGatedContent: true,
      });
    }
    expect(byId["follower-recheck-delay-1"]).toMatchObject({
      type: "delay",
      data: { duration: 1, unit: "minutes" },
    });
    expect(byId["follower-recheck-delay-2"]).toMatchObject({
      type: "delay",
      data: { duration: 2, unit: "minutes" },
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
          id: "required-e12",
          source: "follower-recheck-1",
          target: "follower-recheck-delay-1",
          sourceHandle: "false",
        },
        {
          id: "required-e15",
          source: "follower-recheck-2",
          target: "follower-recheck-delay-2",
          sourceHandle: "false",
        },
        {
          id: "required-e18",
          source: "follower-recheck-3",
          target: "follower-not-confirmed",
          sourceHandle: "false",
        },
      ]),
    );
  });
});
