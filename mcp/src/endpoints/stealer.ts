import { z } from "zod";
import { term } from "../validate";
import { commonParams, commonShape, scopeField, scopedTerm } from "./common";
import { credentialFlags } from "./flags";
import { defineSearch, type Params } from "./types";

export const stealer = defineSearch({
  tool: "search_stealer_logs",
  title: "Search infostealer logs",
  description: "Credentials stolen by infostealer malware from infected devices, usually with a plaintext password and the site it was used on. Search by domain, email, username, IP or /24 range, or by password or hardware ID with `by`. Costs 1 query per page.",
  path: "/stealer",
  shape: {
    query: term.describe("Domain, email, username, IP or /24 range; or a password or hardware ID when `by` is set."),
    scope: scopeField,
    by: z.enum(["term", "password", "hwid"]).optional().describe("What `query` is. Default 'term'."),
    ...commonShape,
  },
  build: (a) => {
    // The search parameter goes first so URLs read naturally (s=...&date=...).
    const lead: Params = a.by === "password" ? { pwd: a.query } : a.by === "hwid" ? { hid: a.query } : { s: scopedTerm(a.query, a.scope) };
    return { params: { ...lead, ...commonParams(a) }, query: a.query };
  },
  display: {
    label: "stealer logs",
    dateFields: ["fnd"],
    fields: ["usr", "pwd", "src", "fnd", "mal", "hid", "nme"],
    flags: credentialFlags("usr"),
    emptyHint: "Try check_credential_exposure to cover the other credential sources, or an earlier `since`.",
  },
});
