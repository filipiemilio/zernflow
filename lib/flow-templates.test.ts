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
    // flow, so follow-wait resumes straight into the recheck sequence, and
    // the first check happens immediately — no forced wait before it.
    expect(byId["follow-checking-feedback"]).toBeUndefined();
    expect(byId["follower-recheck-before-first"]).toBeUndefined();
    expect(template.edges).toEqual(
      expect.arrayContaining([
        { id: "required-e9", source: "follow-wait", target: "follower-recheck-1" },
      ]),
    );

    for (const id of ["follower-recheck-1", "follower-recheck-2", "follower-recheck-3"]) {
      expect(byId[id].data).toMatchObject({
        conditionType: "instagram_follower",
        allowFollowerGatedContent: true,
      });
    }

    // Fastest-first sequence: immediate check, then one short automatic
    // retry (catches near-instant propagation lag without contact action),
    // then an unbounded reactive wait resumed by the contact's own next
    // message — replacing the old fixed-clock delay that gave up on a
    // contact who really had followed but took longer than the window.
    expect(byId["follower-recheck-delay-1"]).toMatchObject({
      type: "delay",
      data: { duration: 1, unit: "minutes" },
    });
    expect(byId["follower-recheck-delay-2"]).toBeUndefined();
    expect(byId["follower-recheck-wait"]).toMatchObject({
      type: "action",
      data: { actionType: "smartDelay" },
    });
    // Deliberately no expectedPayload/acceptedText: matchesWaitingSessionInput
    // treats an unconstrained wait as satisfied by any inbound message, so a
    // free-text reply resumes it just as well as a button tap would.
    expect(byId["follower-recheck-wait"].data.expectedPayload).toBeUndefined();
    expect(byId["follower-recheck-wait"].data.acceptedText).toBeUndefined();

    expect(byId["follow-recheck-feedback-1"].data.messages).toHaveLength(1);
    expect(byId["follow-recheck-feedback-2"].data.messages).toHaveLength(1);
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
          id: "required-e10",
          source: "follower-recheck-1",
          target: "follow-recheck-feedback-1",
          sourceHandle: "false",
        },
        { id: "required-e11", source: "follow-recheck-feedback-1", target: "follower-recheck-delay-1" },
        { id: "required-e12", source: "follower-recheck-delay-1", target: "follower-recheck-2" },
        {
          id: "required-e14",
          source: "follower-recheck-2",
          target: "follow-recheck-feedback-2",
          sourceHandle: "false",
        },
        { id: "required-e15", source: "follow-recheck-feedback-2", target: "follower-recheck-wait" },
        { id: "required-e16", source: "follower-recheck-wait", target: "follower-recheck-3" },
        {
          id: "required-e18",
          source: "follower-recheck-3",
          target: "follower-not-confirmed",
          sourceHandle: "false",
        },
      ]),
    );

    // No cycles: every recheck round is a distinct forward node, never a
    // loop back to an already-visited one, which the publish validator
    // would otherwise reject outright.
    const nodeIds = new Set(template.nodes.map((n) => n.id));
    expect(nodeIds.size).toBe(template.nodes.length);
  });
});
