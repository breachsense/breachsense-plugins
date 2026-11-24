import { z } from "zod";
import { term } from "../validate";
import { commonParams, commonShape } from "./common";
import { str } from "./flags";
import { defineSearch, type Params } from "./types";

export const nhi = defineSearch({
  tool: "search_leaked_secrets",
  title: "Search leaked API keys and secrets",
  description: "Leaked API keys, tokens and other non-human credentials (AWS, GitHub, OpenAI, Stripe, Slack and more). Search by domain or exact email, optionally filtered. Costs 1 query per page.",
  path: "/nhi",
  shape: {
    query: term.describe("Domain or exact email address."),
    platform: z.string().trim().max(64).optional().describe("Platform, e.g. AWS, GitHub, OpenAI, Anthropic, Slack, Stripe."),
    category: z.enum(["cloud_infra", "dev_platform", "ai_platform", "payment", "collaboration", "generic_secret"]).optional(),
    token_type: z.string().trim().max(64).optional().describe("Specific token type, e.g. aws_access_key, github_pat."),
    prefix: z.string().trim().max(32).optional().describe("Token prefix, e.g. AKIA, ghp_, sk-ant-."),
    ip: z.string().trim().max(64).optional().describe("IP address of the infected device or host."),
    hwid: z.string().trim().max(128).optional().describe("Hardware ID of the infected device."),
    ...commonShape,
  },
  build: (a) => {
    const params: Params = { s: a.query, ...commonParams(a) };
    if (a.platform) params.platform = a.platform;
    if (a.category) params.category = a.category;
    if (a.token_type) params.token_type = a.token_type;
    if (a.prefix) params.prefix = a.prefix;
    if (a.ip) params.ip = a.ip;
    if (a.hwid) params.hid = a.hwid;
    return { params, query: a.query };
  },
  display: {
    label: "leaked secrets",
    dateFields: ["fnd"],
    fields: ["token_type", "platform", "category", "source_type", "token", "usr", "fnd"],
    flags: (row) => (["cloud_infra", "payment"].includes(str(row.category)) ? ["Cloud or payment secret"] : []),
    emptyHint: "Try search_stealer_logs for the same domain.",
  },
});
