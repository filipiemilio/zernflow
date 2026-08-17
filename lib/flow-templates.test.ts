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
  it("checks follow before prompting, then rechecks after the session-bound Já segui button", () => {
    const template = instagramFollowerRequiredTemplate();
    const byId = Object.fromEntries(template.nodes.map((node) => [node.id, node]));
    const opening = byId["required-opening"].data as MessageData;
    const prompt = byId["follow-prompt"].data as MessageData;

    expect(opening.messages[0].buttons).toEqual([
      {
        type: "postback",
        title: "Quero receber",
        payload: "ZF_OPEN_{{session_id}}",
      },
    ]);
    expect(byId["required-opening-wait"]).toMatchObject({
      type: "action",
      data: {
        actionType: "smartDelay",
        expectedPayload: "ZF_OPEN_{{session_id}}",
        acceptedText: ["link"],
      },
    });
    expect(byId["initial-follower-check"].data.conditions).toEqual([
      { field: "instagram_follower", operator: "equals", value: "true" },
    ]);
    expect(prompt.messages[0].buttons).toEqual([
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
    ]);
    expect(byId["follow-wait"]).toMatchObject({
      type: "action",
      data: {
        actionType: "smartDelay",
        expectedPayload: "ZF_FOLLOWED_{{session_id}}",
      },
    });
    expect(byId["follower-recheck"].data).toMatchObject({
      conditionType: "instagram_follower",
      allowFollowerGatedContent: true,
      conditions: [
        { field: "instagram_follower", operator: "equals", value: "true" },
      ],
    });

    expect(template.edges).toEqual(
      expect.arrayContaining([
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
        {
          id: "required-e8",
          source: "follower-recheck",
          target: "required-link-delivery",
          sourceHandle: "true",
        },
      ]),
    );
    expect(
      template.edges.some(
        (edge) => edge.source === "follower-recheck" && edge.sourceHandle === "false",
      ),
    ).toBe(false);
  });
});
