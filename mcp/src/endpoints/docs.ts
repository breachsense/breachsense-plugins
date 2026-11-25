import { z } from "zod";
import { term } from "../validate";
import { commonParams, commonShape } from "./common";
import { defineSearch, type Params } from "./types";

export const docs = defineSearch({
  tool: "search_documents",
  title: "Search inside leaked documents",
  description: "Full-text search inside files leaked in ransomware attacks, third-party breaches and exposed databases: company or person names, addresses, project names, any phrase. Results include doc_id for download_document. Costs 1 query per page.",
  path: "/docs",
  shape: {
    query: term.describe("Text to find. Multi-word text is searched as an exact phrase unless fuzzy is set."),
    fuzzy: z.boolean().optional().describe("Fuzzy matching instead of exact phrase."),
    ...commonShape,
  },
  build: (a) => {
    const phrase = !a.fuzzy && /\s/.test(a.query) && !/^".*"$/.test(a.query) ? `"${a.query}"` : a.query;
    const params: Params = { s: phrase, ...commonParams(a) };
    if (a.fuzzy) params.fuzzy = "1";
    return { params, query: a.query };
  },
  display: {
    label: "leaked documents",
    dateFields: ["leak_date", "extraction_date"],
    fields: ["doc_id", "file_name", "leak_date", "threat_actor", "source_type", "company_name", "file_size"],
    emptyHint: "Try fuzzy matching, or search_ransomware_leaks for the company's domain.",
  },
});
