import { z } from "zod";
import { commonParams, commonShape, domainOrRangeShape, rangeOrDomain } from "./common";
import { defineSearch, type Params } from "./types";

export const darkweb = defineSearch({
  tool: "search_ransomware_leaks",
  title: "Search ransomware leak sites",
  description: "Victims listed on ransomware and extortion leak sites. Search one victim domain, or list every victim indexed in a date range of up to 31 days. Listing links are .onion addresses that need Tor Browser. Costs 1 query per page.",
  path: "/darkweb",
  shape: {
    ...domainOrRangeShape,
    with_descriptions: z.boolean().optional().describe("Add short descriptions of the victim and the threat actor."),
    ...commonShape,
  },
  build: (a) => {
    const b = rangeOrDomain(a);
    if ("error" in b) return b;
    const params: Params = { ...b.params, ...commonParams(a) };
    if (a.with_descriptions) { params.desc = true; params.tadesc = true; }
    return { params, query: b.query };
  },
  display: {
    label: "ransomware leak sites",
    dateFields: ["found"],
    fields: ["data", "name", "site", "src", "found", "desc", "tadesc"],
    emptyHint: "Try search_forum_mentions for the same domain.",
  },
});
