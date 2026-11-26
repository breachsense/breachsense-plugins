import { commonParams, commonShape, domainOrRangeShape, rangeOrDomain } from "./common";
import { defineSearch } from "./types";

export const radar = defineSearch({
  tool: "search_forum_mentions",
  title: "Search dark-web forum and market mentions",
  description: "Posts and listings on hacker forums and underground markets where access, credentials and breach data are traded. Search one domain, or list a date range of up to 31 days. Costs 1 query per page.",
  path: "/radar",
  shape: { ...domainOrRangeShape, ...commonShape },
  build: (a) => {
    const b = rangeOrDomain(a);
    return "error" in b ? b : { params: { ...b.params, ...commonParams(a) }, query: b.query };
  },
  display: {
    label: "forum and market mentions",
    dateFields: ["found"],
    fields: ["data", "src", "found"],
    emptyHint: "Try search_ransomware_leaks for the same domain.",
  },
});
