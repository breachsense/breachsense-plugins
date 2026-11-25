import { domain } from "../validate";
import { parseDate } from "../dates";
import { commonParams, commonShape } from "./common";
import { defineSearch } from "./types";

export const sessions = defineSearch({
  tool: "search_session_cookies",
  title: "Search stolen session cookies",
  description: "Session cookies taken by infostealer malware. A cookie that has not expired can let an attacker skip the password and MFA, so these are high priority. Search by domain. Costs 1 query per page.",
  path: "/sessions",
  shape: { query: domain.describe("Domain the cookies belong to."), ...commonShape },
  build: (a) => ({ params: { s: a.query, ...commonParams(a) }, query: a.query }),
  display: {
    label: "session cookies",
    dateFields: ["fnd"],
    fields: ["dom", "cookie_name", "val", "expires", "fnd", "mal", "cty"],
    flags: (row, ctx) => {
      const exp = parseDate(row.expires);
      return exp && exp.getTime() >= ctx.today.getTime() ? ["Unexpired session cookie (can bypass MFA)"] : [];
    },
    emptyHint: "Try search_stealer_logs for passwords from the same infected devices.",
  },
});
