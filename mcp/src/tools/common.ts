import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { BreachsenseClient, ClientResult, Fail, RequestSpec, Success } from "../client";
import { SETUP_MESSAGE } from "../config";
import { costLine, type CostTracker } from "../cost";
import { describeFailure } from "../errors";
import { redact } from "../redact";
import type { ResultStore } from "../results";

export interface Deps {
  client: BreachsenseClient | null;
  keySource: string;
  secrets: string[];
  store: ResultStore;
  costs: CostTracker;
  today: () => Date;
}

type ContentItem = CallToolResult["content"][number];

export const costSchema = z.object({ used: z.number(), unknown: z.number() });
export const searchOutput = z.looseObject({ source: z.string(), cost: costSchema });
export const accountOutput = z.looseObject({ cost: costSchema });

export async function call(deps: Deps, spec: RequestSpec): Promise<ClientResult> {
  const r = await deps.client!.request(spec);
  deps.costs.add(r.cost);
  return r.ok ? scrubSuccess(deps, r) : r;
}

/** Remove the license key from anything the server echoed back, before it is stored or shown. */
function scrubSuccess(deps: Deps, r: Success): Success {
  if (!deps.secrets.some((x) => x && r.text.includes(x))) return r;
  const text = redact(r.text, deps.secrets);
  let json = r.json;
  if (json !== undefined && json !== null) { try { json = JSON.parse(text); } catch { json = redact(JSON.stringify(json), deps.secrets); } }
  return { ...r, text, json, bytes: new TextEncoder().encode(text) };
}

export function okResult(text: string, structured: Record<string, unknown>, extra: ContentItem[] = []): CallToolResult {
  return { content: [{ type: "text", text }, ...extra], structuredContent: structured };
}

export function errorResult(text: string): CallToolResult {
  return { content: [{ type: "text", text }], isError: true };
}

export function setupResult(): CallToolResult {
  return errorResult(SETUP_MESSAGE);
}

export function validationResult(message: string): CallToolResult {
  return errorResult(`${message} No request was sent. Cost: 0 queries used.`);
}

export function failureResult(deps: Deps, r: Fail, prefix = ""): CallToolResult {
  const msg = describeFailure(r, { keySource: deps.keySource, secrets: deps.secrets });
  return errorResult(`${prefix}${msg}\n${costLine(r.cost, deps.costs.total())}`);
}

export function resourceLink(uri: string, name: string, mimeType: string): ContentItem {
  return { type: "resource_link", uri, name, mimeType };
}
