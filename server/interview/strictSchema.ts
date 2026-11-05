// Pure helpers for OpenAI Structured Outputs "strict" mode.
//
// With `strict: false` (the default) OpenAI treats a json_schema as a hint, and
// in practice ~1 in 4 long briefs came back with missing fields or invalid enum
// values, failing Zod validation. Strict mode guarantees the structure, but
// requires every object to be closed (`additionalProperties: false`) and every
// property to be listed in `required`. Optional properties are therefore made
// nullable, and `stripNulls` turns those nulls back into "absent" before Zod.

type JsonSchemaNode = Record<string, unknown>;

export function toStrictJsonSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(toStrictJsonSchema);
  if (!node || typeof node !== "object") return node;
  const src = node as JsonSchemaNode;
  const out: JsonSchemaNode = {};
  for (const [k, v] of Object.entries(src)) {
    if (k === "properties" || k === "required") continue;
    out[k] = k === "items" ? toStrictJsonSchema(v) : v;
  }
  if (src.type === "object" && src.properties && typeof src.properties === "object") {
    const props = src.properties as Record<string, unknown>;
    const required = new Set(Array.isArray(src.required) ? (src.required as string[]) : []);
    const strictProps: Record<string, unknown> = {};
    for (const [name, child] of Object.entries(props)) {
      const strictChild = toStrictJsonSchema(child) as JsonSchemaNode;
      strictProps[name] = required.has(name) ? strictChild : makeNullable(strictChild);
    }
    out.properties = strictProps;
    out.required = Object.keys(props);
    out.additionalProperties = false;
  }
  return out;
}

function makeNullable(node: JsonSchemaNode): JsonSchemaNode {
  const t = node.type;
  if (typeof t === "string") {
    const next: JsonSchemaNode = { ...node, type: [t, "null"] };
    if (Array.isArray(node.enum)) next.enum = [...(node.enum as unknown[]), null];
    return next;
  }
  if (Array.isArray(t)) return t.includes("null") ? node : { ...node, type: [...t, "null"] };
  return { anyOf: [node, { type: "null" }] };
}

/** Recursively drops null-valued object keys (and null array items). */
export function stripNulls(value: unknown): unknown {
  if (Array.isArray(value)) return value.filter(v => v !== null).map(stripNulls);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v === null) continue;
      out[k] = stripNulls(v);
    }
    return out;
  }
  return value;
}

export function strictOutputSchema<T extends { name: string; schema: unknown }>(def: T) {
  return { name: def.name, schema: toStrictJsonSchema(def.schema) as Record<string, unknown>, strict: true as const };
}
