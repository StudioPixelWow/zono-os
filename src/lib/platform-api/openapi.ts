// ============================================================================
// 🔌 Platform API — OpenAPI 3.1 document builder (pure). 31.0. Part 7.
// Builds a Swagger/OpenAPI spec from the endpoint registry. Bearer (API key) auth,
// examples, error schema. No I/O.
// ============================================================================
import { ENDPOINTS } from "./registry";
import { API_BASE, PLATFORM_API_VERSION, type EndpointSpec } from "./types";

type Json = Record<string, unknown>;

function operation(e: EndpointSpec): Json {
  const params = (e.params ?? []).filter((p) => p.in === "query").map((p) => ({ name: p.name, in: "query", required: p.required, description: p.description, schema: { type: "string" } }));
  const bodyProps = (e.params ?? []).filter((p) => p.in === "body");
  const op: Json = {
    operationId: e.id, summary: e.summary,
    tags: [e.kind === "ai" ? "AI" : e.kind === "action" ? "Actions" : "Entities"],
    security: [{ apiKey: [e.scope] }],
    responses: {
      "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiOk" } } } },
      "401": { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiError" } } } },
      "403": { description: "Forbidden (scope)", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiError" } } } },
      "429": { description: "Rate limited", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiError" } } } },
    },
  };
  if (params.length) op.parameters = params;
  if (bodyProps.length) op.requestBody = {
    required: bodyProps.some((p) => p.required),
    content: { "application/json": { schema: { type: "object", required: bodyProps.filter((p) => p.required).map((p) => p.name), properties: Object.fromEntries(bodyProps.map((p) => [p.name, { type: "string", description: p.description }])) } } },
  };
  if (e.approvalGated) op["x-approval-gated"] = true;
  return op;
}

export function buildOpenApi(origin = ""): Json {
  const paths: Json = {};
  for (const e of ENDPOINTS) {
    const full = `${API_BASE}${e.path}`;
    const existing = (paths[full] as Json) ?? {};
    existing[e.method.toLowerCase()] = operation(e);
    paths[full] = existing;
  }
  return {
    openapi: "3.1.0",
    info: { title: "ZONO Platform API", version: PLATFORM_API_VERSION, description: "Secure, approval-gated access to every ZONO engine. Read endpoints are read-only; action endpoints create approval-gated artifacts (missions/drafts/workflows) — nothing executes automatically." },
    servers: [{ url: origin || "https://app.zono" }],
    components: {
      securitySchemes: { apiKey: { type: "http", scheme: "bearer", description: "Bearer <API key>. Personal or organization key with scopes." } },
      schemas: {
        ApiOk: { type: "object", properties: { ok: { type: "boolean" }, data: {}, meta: { type: "object", properties: { version: { type: "string" }, approvalGated: { type: "boolean" } } } } },
        ApiError: { type: "object", properties: { ok: { type: "boolean", example: false }, error: { type: "string" }, code: { type: "string" }, status: { type: "integer" } } },
      },
    },
    security: [{ apiKey: [] }],
    tags: [{ name: "Entities" }, { name: "AI" }, { name: "Actions" }],
    paths,
  };
}
