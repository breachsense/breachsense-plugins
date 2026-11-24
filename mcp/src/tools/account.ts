import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { BILLING } from "../billing";
import type { Params } from "../endpoints/types";
import { costLine, sumCosts } from "../cost";
import { describeFailure, providerMessage } from "../errors";
import { redact } from "../redact";
import { EMAIL_RE, isHttpsUrl } from "../validate";
import { accountOutput, call, errorResult, failureResult, okResult, setupResult, validationResult, type Deps } from "./common";

const READ = { readOnlyHint: true, destructiveHint: false, openWorldHint: true };
const WRITE = { readOnlyHint: false, destructiveHint: true, openWorldHint: true };

const asset = z.string().trim().min(1).max(253)
  .refine((s) => !s.includes("::") && !s.includes(","), "must be a single domain, company name, keyword or 6-digit BIN")
  .describe("Domain, company name, brand keyword, or a 6-digit card BIN.");
const recipient = z.string().trim().refine((v) => EMAIL_RE.test(v) || isHttpsUrl(v), "must be an email address or an https webhook URL");

function top(counts: Map<string, number>, n = 10): string {
  return [...counts].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k}: ${v}`).join(", ");
}
function tally(rows: Record<string, unknown>[], key: (r: Record<string, unknown>) => string): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) { const k = key(r); m.set(k, (m.get(k) ?? 0) + 1); }
  return m;
}

async function runWrite(deps: Deps, params: Params, extraSecrets: string[], format?: (json: unknown) => string) {
  if (!deps.client) return setupResult();
  const r = await call(deps, { path: "/account", params, op: "write", billing: BILLING.account });
  const secrets = [...deps.secrets, ...extraSecrets];
  if (!r.ok) return failureResult({ ...deps, secrets }, r);
  const msg = providerMessage(r.json, secrets) ?? `HTTP ${r.status}`;
  const extra = format ? ` ${format(r.json)}` : "";
  return okResult(`Breachsense: ${msg}.${extra}\n${costLine(r.cost, deps.costs.total())}`.replace("..", "."),
    { action: params.action, message: msg, cost: r.cost });
}

export function registerAccountTools(server: McpServer, deps: Deps): void {
  server.registerTool("get_usage", {
    title: "Check quota and usage log",
    description: "Remaining monthly queries for this license, plus a summary of the usage audit log (every counted request, kept 35 days): by endpoint, by day, and by IP and client. Use it when the user asks how many queries are left or who used them.",
    inputSchema: {
      days: z.number().int().min(1).max(35).optional().describe("Days of audit log to summarise (default 30)."),
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Start date YYYY-MM-DD (instead of days)."),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("End date YYYY-MM-DD."),
    },
    outputSchema: accountOutput,
    annotations: READ,
  }, async (a) => {
    if (!deps.client) return setupResult();
    const rem = await call(deps, { path: "/stealer", params: { r: true }, op: "read", billing: BILLING.remaining });
    const params: Params = { action: "audit" };
    if (a.from || a.to) { if (a.from) params.from = a.from; if (a.to) params.to = a.to; } else params.days = String(a.days ?? 30);
    const audit = await call(deps, { path: "/account", params, op: "read", billing: BILLING.account });
    const ctx = { keySource: deps.keySource, secrets: deps.secrets };
    const cost = sumCosts(rem.cost, audit.cost);
    const lines: string[] = [];
    const structured: Record<string, unknown> = { cost };

    if (rem.ok) {
      const n = (rem.json as { Remaining?: unknown })?.Remaining;
      structured.remaining = typeof n === "number" ? n : null;
      lines.push(typeof n === "number" ? `Remaining this month: ${n} queries.` : "Remaining quota: the reply did not include a number.");
    } else lines.push(`Remaining quota unavailable: ${describeFailure(rem, ctx)}`);

    if (audit.ok) {
      const o = (audit.json ?? {}) as { count?: number; events?: Record<string, unknown>[] };
      const events = Array.isArray(o.events) ? o.events : [];
      const count = typeof o.count === "number" ? o.count : events.length;
      structured.audit_count = count;
      lines.push(`Audit log: ${count} counted requests in the period.`);
      if (events.length) {
        lines.push(`By endpoint: ${top(tally(events, (e) => String(e.endpoint ?? "?")))}`);
        lines.push(`By day: ${top(tally(events, (e) => String(e.time ?? "").slice(0, 10)), 35)}`);
        lines.push(`By IP and client: ${top(tally(events, (e) => `${e.ip ?? "?"} ${e.user_agent ?? "?"}`))}`);
      }
    } else lines.push(`Audit log unavailable: ${describeFailure(audit, ctx)}`);

    lines.push(costLine(cost, deps.costs.total()));
    if (!rem.ok && !audit.ok) return errorResult(lines.join("\n"));
    return okResult(lines.join("\n"), structured);
  });

  server.registerTool("get_monitoring_setup", {
    title: "Show monitoring setup",
    description: "Shows the watchlist, license-wide alert recipients, technical contact and alert whitelist in one call. Stored webhook credentials are never shown.",
    inputSchema: {},
    outputSchema: accountOutput,
    annotations: READ,
  }, async () => {
    if (!deps.client) return setupResult();
    const parts: [string, Params][] = [
      ["Watchlist", { action: "list" }],
      ["License-wide alert recipients", { action: "list", notify: true }],
      ["Technical contact", { action: "list", tech: true }],
      ["Alert whitelist", { action: "list", whitelist: true }],
    ];
    const lines: string[] = [];
    const costs = [];
    const structured: Record<string, unknown> = {};
    let failures = 0;
    for (const [label, params] of parts) {
      const r = await call(deps, { path: "/account", params, op: "read", billing: BILLING.account });
      costs.push(r.cost);
      if (!r.ok) { failures++; lines.push(`${label}: unavailable. ${describeFailure(r, { keySource: deps.keySource, secrets: deps.secrets })}`); continue; }
      const shown = redact(JSON.stringify(r.json ?? null, null, 1), deps.secrets);
      structured[label] = JSON.parse(shown);
      lines.push(`${label}: ${shown}`);
    }
    const cost = sumCosts(...costs);
    structured.cost = cost;
    lines.push(costLine(cost, deps.costs.total()));
    return failures === parts.length ? errorResult(lines.join("\n")) : okResult(lines.join("\n"), structured);
  });

  server.registerTool("manage_watchlist", {
    title: "Add or remove a watchlist asset",
    description: "Adds or removes a monitored asset. Optionally sets per-asset alert recipients (emails or https webhooks) and premium marketplace monitoring. Confirm the exact change with the user first.",
    inputSchema: {
      action: z.enum(["add", "remove"]),
      asset,
      recipients: z.array(recipient).max(20).optional().describe("Per-asset recipients (add only)."),
      premium: z.boolean().optional().describe("Turn premium marketplace monitoring on or off for this asset (add only, if the contract includes it)."),
    },
    outputSchema: accountOutput,
    annotations: WRITE,
  }, async (a) => {
    if (a.action === "remove" && (a.recipients?.length || a.premium !== undefined)) return validationResult("recipients and premium only apply when adding.");
    const ast = a.recipients?.length ? `${a.asset}::${a.recipients.join(",")}` : a.asset;
    const params: Params = { action: a.action === "add" ? "add" : "del", ast };
    if (a.premium !== undefined) params.premium = a.premium ? "1" : "0";
    return runWrite(deps, params, []);
  });

  server.registerTool("manage_alert_recipients", {
    title: "Manage alert recipients",
    description: "Adds or removes a license-wide alert recipient (email or https webhook) or the technical contact, or sets the HTTP basic-auth credential used for all webhooks (user:pass, add only; never shown back). Confirm the exact change with the user first.",
    inputSchema: {
      action: z.enum(["add", "remove"]),
      type: z.enum(["recipient", "technical_contact", "webhook_auth"]),
      value: z.string().trim().min(1).max(2048).describe("Email, https URL, or user:pass for webhook_auth."),
    },
    outputSchema: accountOutput,
    annotations: WRITE,
  }, async (a) => {
    const verb = a.action === "add" ? "add" : "del";
    if (a.type === "webhook_auth") {
      if (a.action === "remove") return validationResult("The API can't remove the webhook credential; add a new one to replace it.");
      if (!/^[^:\s]+:\S+$/.test(a.value)) return validationResult("webhook_auth must look like user:pass.");
      return runWrite(deps, { action: "add", creds: a.value }, [a.value, a.value.split(":").slice(1).join(":")]);
    }
    if (a.type === "technical_contact" && !EMAIL_RE.test(a.value)) return validationResult("technical_contact must be an email address.");
    if (a.type === "recipient" && !(EMAIL_RE.test(a.value) || isHttpsUrl(a.value))) return validationResult("recipient must be an email address or an https webhook URL.");
    return runWrite(deps, a.type === "recipient" ? { action: verb, notify: a.value } : { action: verb, tech: a.value }, []);
  });

  server.registerTool("manage_whitelist", {
    title: "Manage the alert whitelist",
    description: "Suppresses alerts for an exact credential pair (user:password) or every alert for a username, or removes such an entry. Filters alerts only; direct searches still return the data. Confirm the exact change with the user first.",
    inputSchema: {
      action: z.enum(["add", "remove"]),
      entry: z.string().trim().min(1).max(512).describe("user@domain:password for one credential pair, or user@domain for every alert on that username."),
    },
    outputSchema: accountOutput,
    annotations: WRITE,
  }, async (a) => runWrite(deps, { action: a.action === "add" ? "add" : "del", whitelist: true, ast: a.entry }, []));

  server.registerTool("send_test_alert", {
    title: "Send a test alert",
    description: "Sends a sample alert (marked test: true) to an asset's recipients, or to one of its webhooks. The asset must be on the watchlist. Limited to 20 per license per day. Confirm with the user first.",
    inputSchema: { asset, webhook: z.string().trim().refine(isHttpsUrl, "must be an https URL").optional() },
    outputSchema: accountOutput,
    annotations: WRITE,
  }, async (a) => runWrite(deps, { action: "test", ast: a.webhook ? `${a.asset}::${a.webhook}` : a.asset }, [], (json) => {
    const o = (json ?? {}) as { remaining_today?: unknown; delivered?: Record<string, unknown> };
    const d = o.delivered ?? {};
    const n = (v: unknown) => (typeof v === "number" ? v : 0);
    const left = typeof o.remaining_today === "number" ? ` Tests left today: ${o.remaining_today}.` : "";
    return `${n(d.webhooks_ok)} webhook${n(d.webhooks_ok) === 1 ? "" : "s"} delivered, ${n(d.webhooks_failed)} failed, ${n(d.emails_queued)} emails queued.${left}`;
  }));
}
