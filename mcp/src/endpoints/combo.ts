import { z } from "zod";
import { term } from "../validate";
import { commonParams, commonShape } from "./common";
import { credentialFlags } from "./flags";
import { defineSearch, type Params } from "./types";

export const combo = defineSearch({
  tool: "search_combo_lists",
  title: "Search combo lists",
  description: "Email and password pairs from credential combo lists traded on hacking forums. Broader but lower fidelity than stealer logs. Search by domain, email, username or IP, or by password with `by`. Costs 1 query per page.",
  path: "/combo",
  shape: {
    query: term.describe("Domain, email, username or IP; or a password when `by` is 'password'."),
    by: z.enum(["term", "password"]).optional().describe("What `query` is. Default 'term'."),
    ...commonShape,
  },
  build: (a) => {
    const lead: Params = a.by === "password" ? { pwd: a.query } : { s: a.query };
    return { params: { ...lead, ...commonParams(a) }, query: a.query };
  },
  display: {
    label: "combo lists",
    dateFields: ["fnd"],
    fields: ["usr", "pwd", "src", "fle", "fnd"],
    flags: credentialFlags("usr"),
    emptyHint: "Try search_stealer_logs for credentials taken from infected devices.",
  },
});
