// Structured contracts for the Interview Copilot LLM calls.
//
// Each contract has two representations that must stay in lockstep:
//   - a Zod schema, used to validate (and fail closed on) model output;
//   - a JSON Schema object, passed to `invokeLLM` as `outputSchema` so the
//     provider is steered toward the shape we expect.
//
// We never trust the model to honor the schema — every response is parsed and
// re-validated with Zod, and malformed output is rejected with a typed error.

import { z } from "zod";

// Bump whenever a prompt or contract changes, so stored results are traceable.
export const PROMPT_VERSION = "interview-2026-10-13";

export class MalformedModelOutput extends Error {
  constructor(message = "MODEL_OUTPUT_MALFORMED") {
    super(message);
    this.name = "MalformedModelOutput";
  }
}

// --- Brief (Prepare) -------------------------------------------------------

export const evidenceItemSchema = z.object({
  id: z.string().min(1).max(32),
  claim: z.string().min(1).max(600),
  source: z.enum(["resume", "jd", "user"]),
  category: z.string().min(1).max(48),
  verified: z.boolean(),
});

export const requirementSchema = z.object({
  id: z.string().min(1).max(32),
  text: z.string().min(1).max(600),
  category: z.enum(["must_have", "nice_to_have"]),
  priority: z.enum(["high", "medium", "low"]),
  evidenceIds: z.array(z.string().max(32)).max(20).default([]),
  gap: z.boolean(),
});

export const questionSchema = z.object({
  id: z.string().min(1).max(32),
  text: z.string().min(1).max(600),
  category: z.enum(["behavioral", "technical", "product", "sql"]),
  difficulty: z.enum(["easy", "medium", "hard"]),
  sourceRequirementId: z.string().max(32).optional(),
});

export const briefSchema = z.object({
  roleSummary: z.string().min(1).max(2000),
  requirements: z.array(requirementSchema).max(40),
  evidence: z.array(evidenceItemSchema).max(60),
  gaps: z.array(z.string().max(400)).max(30),
  questions: z.array(questionSchema).max(40),
  checklist: z.array(z.string().max(300)).max(30),
});

export type Brief = z.infer<typeof briefSchema>;

// --- Practice feedback -----------------------------------------------------

const scoreField = z.number().int().min(0).max(5);

export const answerFeedbackSchema = z.object({
  scores: z.object({
    relevance: scoreField,
    structure: scoreField,
    evidence: scoreField,
    technicalCorrectness: scoreField,
    clarity: scoreField,
    concision: scoreField,
  }),
  strengths: z.array(z.string().max(400)).max(10),
  improvements: z.array(z.string().max(400)).max(10),
  unsupportedClaims: z.array(z.string().max(400)).max(10),
  suggestedOutline: z.array(z.string().max(300)).max(10),
  followUpQuestions: z.array(z.string().max(300)).max(6),
});

export type AnswerFeedback = z.infer<typeof answerFeedbackSchema>;

// --- Live answer suggestion ------------------------------------------------

export const answerSuggestionSchema = z.object({
  directAnswer: z.string().max(1200),
  bullets: z.array(z.string().max(400)).max(8),
  evidence: z
    .array(
      z.object({
        evidenceId: z.string().max(32),
        claim: z.string().max(600),
        verified: z.boolean(),
      }),
    )
    .max(10),
  assumptions: z.array(z.string().max(400)).max(8),
  followUpQuestion: z.string().max(400).optional(),
  unsupportedClaims: z.array(z.string().max(400)).max(10),
  confidence: z.enum(["high", "medium", "low"]),
  shouldVerify: z.boolean(),
});

export type AnswerSuggestion = z.infer<typeof answerSuggestionSchema>;

// --- SQL answer ------------------------------------------------------------

export const sqlAnswerSchema = z.object({
  dialect: z.string().max(32),
  sql: z.string().max(8000),
  explanation: z.string().max(4000),
  assumptions: z.array(z.string().max(400)).max(12),
  schemaUsed: z.array(z.string().max(120)).max(40),
  edgeCases: z.array(z.string().max(400)).max(12),
  complexity: z.string().max(200).optional(),
  alternativeSql: z.string().max(8000).optional(),
  warnings: z.array(z.string().max(400)).max(12),
});

export type SqlAnswer = z.infer<typeof sqlAnswerSchema>;

// Parse + validate model output, throwing a typed error on any mismatch.
export function parseModelJson<T>(schema: z.ZodType<T>, raw: string): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new MalformedModelOutput();
  }
  const result = schema.safeParse(parsed);
  if (!result.success) throw new MalformedModelOutput();
  return result.data;
}

// --- JSON Schemas for invokeLLM outputSchema -------------------------------
// Hand-written to match the Zod shapes above. Kept permissive on string
// lengths (the Zod pass enforces bounds) but strict on structure.

const stringArray = { type: "array", items: { type: "string" } };

export const briefJsonSchema = {
  name: "interview_brief",
  schema: {
    type: "object",
    properties: {
      roleSummary: { type: "string" },
      requirements: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            text: { type: "string" },
            category: { type: "string", enum: ["must_have", "nice_to_have"] },
            priority: { type: "string", enum: ["high", "medium", "low"] },
            evidenceIds: stringArray,
            gap: { type: "boolean" },
          },
          required: ["id", "text", "category", "priority", "evidenceIds", "gap"],
        },
      },
      evidence: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            claim: { type: "string" },
            source: { type: "string", enum: ["resume", "jd", "user"] },
            category: { type: "string" },
            verified: { type: "boolean" },
          },
          required: ["id", "claim", "source", "category", "verified"],
        },
      },
      gaps: stringArray,
      questions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            text: { type: "string" },
            category: { type: "string", enum: ["behavioral", "technical", "product", "sql"] },
            difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
            sourceRequirementId: { type: "string" },
          },
          required: ["id", "text", "category", "difficulty"],
        },
      },
      checklist: stringArray,
    },
    required: ["roleSummary", "requirements", "evidence", "gaps", "questions", "checklist"],
  },
} as const;

export const answerFeedbackJsonSchema = {
  name: "interview_answer_feedback",
  schema: {
    type: "object",
    properties: {
      scores: {
        type: "object",
        properties: {
          relevance: { type: "integer", minimum: 0, maximum: 5 },
          structure: { type: "integer", minimum: 0, maximum: 5 },
          evidence: { type: "integer", minimum: 0, maximum: 5 },
          technicalCorrectness: { type: "integer", minimum: 0, maximum: 5 },
          clarity: { type: "integer", minimum: 0, maximum: 5 },
          concision: { type: "integer", minimum: 0, maximum: 5 },
        },
        required: ["relevance", "structure", "evidence", "technicalCorrectness", "clarity", "concision"],
      },
      strengths: stringArray,
      improvements: stringArray,
      unsupportedClaims: stringArray,
      suggestedOutline: stringArray,
      followUpQuestions: stringArray,
    },
    required: ["scores", "strengths", "improvements", "unsupportedClaims", "suggestedOutline", "followUpQuestions"],
  },
} as const;

export const answerSuggestionJsonSchema = {
  name: "interview_answer_suggestion",
  schema: {
    type: "object",
    properties: {
      directAnswer: { type: "string" },
      bullets: stringArray,
      evidence: {
        type: "array",
        items: {
          type: "object",
          properties: {
            evidenceId: { type: "string" },
            claim: { type: "string" },
            verified: { type: "boolean" },
          },
          required: ["evidenceId", "claim", "verified"],
        },
      },
      assumptions: stringArray,
      followUpQuestion: { type: "string" },
      unsupportedClaims: stringArray,
      confidence: { type: "string", enum: ["high", "medium", "low"] },
      shouldVerify: { type: "boolean" },
    },
    required: ["directAnswer", "bullets", "evidence", "assumptions", "unsupportedClaims", "confidence", "shouldVerify"],
  },
} as const;

export const sqlAnswerJsonSchema = {
  name: "interview_sql_answer",
  schema: {
    type: "object",
    properties: {
      dialect: { type: "string" },
      sql: { type: "string" },
      explanation: { type: "string" },
      assumptions: stringArray,
      schemaUsed: stringArray,
      edgeCases: stringArray,
      complexity: { type: "string" },
      alternativeSql: { type: "string" },
      warnings: stringArray,
    },
    required: ["dialect", "sql", "explanation", "assumptions", "schemaUsed", "edgeCases", "warnings"],
  },
} as const;

export const SQL_DIALECTS = ["postgres", "mysql", "sqlserver", "bigquery", "snowflake", "generic"] as const;
export type SqlDialect = (typeof SQL_DIALECTS)[number];

export const PRACTICE_CATEGORIES = ["behavioral", "technical", "product", "sql"] as const;
export type PracticeCategory = (typeof PRACTICE_CATEGORIES)[number];
