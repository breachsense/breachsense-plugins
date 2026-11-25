import { term } from "../validate";
import { commonParams, commonShape, scopeField, scopedTerm } from "./common";
import { credentialFlags, str } from "./flags";
import { defineSearch } from "./types";

const cred = credentialFlags("usr");

export const phish = defineSearch({
  tool: "search_phishing_captures",
  title: "Search phishing kit captures",
  description: "Credentials victims typed into phishing pages, recovered from the attackers' own collection channels. A hit means the person really submitted the credential to an attacker. Search by domain, @domain, exact email or IP. Costs 1 query per page.",
  path: "/phish",
  shape: { query: term.describe("Domain, email or IP."), scope: scopeField, ...commonShape },
  build: (a) => ({ params: { s: scopedTerm(a.query, a.scope), ...commonParams(a) }, query: a.query }),
  display: {
    label: "phishing captures",
    dateFields: ["fnd"],
    fields: ["usr", "pwd", "brand", "kit_url", "fnd", "country", "otp"],
    flags: (row, ctx) => {
      const out = str(row.otp).trim() ? ["OTP captured with the credential (possible live login interception)"] : [];
      return [...out, ...cred(row, ctx)];
    },
    emptyHint: "Try get_attack_surface with only 'lookalikes' to find phishing domains targeting this brand.",
  },
});
