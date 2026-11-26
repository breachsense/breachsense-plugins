import { z } from "zod";
import { term } from "../validate";
import { commonParams, commonShape } from "./common";
import { credentialFlags } from "./flags";
import { defineSearch, type Params } from "./types";

export const creds = defineSearch({
  tool: "search_breach_credentials",
  title: "Search third-party breach credentials",
  description: "Credentials from named third-party breaches and exposed databases, with hashes cracked to plaintext where possible. Search by email or domain only. Costs 1 query per page.",
  path: "/creds",
  shape: {
    query: term.describe("Email address or domain."),
    with_source: z.boolean().optional().describe("Add a short description of each breach source."),
    plaintext_only: z.boolean().optional().describe("Only rows with a usable plaintext password, reduced to email and password."),
    count_unique_emails: z.boolean().optional().describe("Return only the number of unique email addresses. Free."),
    ...commonShape,
  },
  build: (a) => {
    const params: Params = { s: a.query, ...commonParams(a) };
    if (a.with_source) params.attr = true;
    if (a.plaintext_only) params.uniq = true;
    if (a.count_unique_emails) params.count = "emails";
    return { params, query: a.query };
  },
  display: {
    label: "breach credentials",
    dateFields: ["fnd"],
    fields: ["eml", "pwd", "src", "fnd", "atr", "dec"],
    flags: credentialFlags("eml"),
    emptyHint: "Try search_stealer_logs or search_combo_lists for the same domain.",
  },
});
