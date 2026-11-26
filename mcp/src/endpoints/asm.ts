import { z } from "zod";
import { domain } from "../validate";
import { commonParams, commonShape } from "./common";
import { str } from "./flags";
import { defineSearch, type Params } from "./types";

export const asm = defineSearch({
  tool: "get_attack_surface",
  title: "Get attack surface findings",
  description: "Discovered subdomains, nameservers, mail servers and possible phishing or lookalike domains for a domain on the watchlist. Costs 1 query per page.",
  path: "/asm",
  shape: {
    domain: domain.describe("A domain already on the watchlist."),
    only: z.enum(["assets", "lookalikes"]).optional().describe("Only discovered assets, or only possible phishing or lookalike domains."),
    ...commonShape,
  },
  build: (a) => {
    const params: Params = { s: a.domain, ...commonParams(a) };
    if (a.only === "assets") params.assets = true;
    if (a.only === "lookalikes") params.pphish = true;
    return { params, query: a.domain };
  },
  display: {
    label: "attack surface findings",
    dateFields: ["found"],
    fields: ["dom", "type", "ip", "cname", "found"],
    flags: (row) => (str(row.type) === "pphish" ? ["Potential phishing or lookalike domain"] : []),
    emptyHint: "The domain must be on the watchlist; check with get_monitoring_setup.",
  },
});
