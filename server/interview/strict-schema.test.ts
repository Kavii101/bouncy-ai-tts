import { describe, expect, it } from "vitest";
import {
  answerFeedbackJsonSchema,
  answerFeedbackSchema,
  answerSuggestionJsonSchema,
  briefJsonSchema,
  parseModelJson,
  sqlAnswerJsonSchema,
} from "./schemas";
import { stripNulls, toStrictJsonSchema } from "./strictSchema";

type Node = { type?: unknown; properties?: Record<string, Node>; required?: string[]; additionalProperties?: unknown; items?: Node; enum?: unknown[] };

// Walks every object node and asserts OpenAI strict-mode requirements.
function assertStrict(node: Node, path = "$") {
  if (node.type === "object" || (Array.isArray(node.type) && node.type.includes("object"))) {
    expect(node.additionalProperties, `${path} closed`).toBe(false);
    expect([...(node.required ?? [])].sort(), `${path} all required`).toEqual(Object.keys(node.properties ?? {}).sort());
    for (const [k, v] of Object.entries(node.properties ?? {})) assertStrict(v, `${path}.${k}`);
  }
  if (node.items) assertStrict(node.items, `${path}[]`);
}

describe("toStrictJsonSchema", () => {
  it.each([
    ["brief", briefJsonSchema],
    ["feedback", answerFeedbackJsonSchema],
    ["suggestion", answerSuggestionJsonSchema],
    ["sql", sqlAnswerJsonSchema],
  ])("makes the %s schema strict-mode compliant", (_n, def) => {
    assertStrict(toStrictJsonSchema(def.schema) as Node);
  });

  it("turns optional properties into nullable required ones, keeping required ones as-is", () => {
    const s = toStrictJsonSchema({
      type: "object",
      properties: { a: { type: "string" }, b: { type: "string", enum: ["x", "y"] } },
      required: ["a"],
    }) as Node;
    expect(s.properties!.a).toEqual({ type: "string" });
    expect(s.properties!.b).toEqual({ type: ["string", "null"], enum: ["x", "y", null] });
    expect(s.required).toEqual(["a", "b"]);
  });

  it("does not mutate the input", () => {
    const input = { type: "object", properties: { a: { type: "string" } }, required: [] as string[] };
    toStrictJsonSchema(input);
    expect(input).toEqual({ type: "object", properties: { a: { type: "string" } }, required: [] });
  });
});

describe("stripNulls + parseModelJson", () => {
  it("drops null keys deeply", () => {
    expect(stripNulls({ a: null, b: { c: null, d: 1 }, e: [{ f: null }] })).toEqual({ b: { d: 1 }, e: [{}] });
  });

  it("accepts strict-mode output where an optional field is null", () => {
    const raw = JSON.stringify({
      scores: { relevance: 3, structure: 3, evidence: 3, technicalCorrectness: 3, clarity: 3, concision: 3 },
      strengths: [],
      improvements: [],
      unsupportedClaims: [],
      suggestedOutline: [],
      followUpQuestions: [],
    });
    expect(parseModelJson(answerFeedbackSchema, raw).scores.clarity).toBe(3);
  });
});
