import type { Cost } from "./client";

export class CostTracker {
  private t: Cost = { used: 0, unknown: 0 };
  add(c: Cost): void { this.t = sumCosts(this.t, c); }
  total(): Cost { return { ...this.t }; }
}

export function sumCosts(...cs: Cost[]): Cost {
  return cs.reduce((a, c) => ({ used: a.used + c.used, unknown: a.unknown + c.unknown }), { used: 0, unknown: 0 });
}

export function costPhrase(c: Cost): string {
  return `${c.used} ${c.used === 1 ? "query" : "queries"} used${c.unknown ? `, ${c.unknown} unknown` : ""}`;
}

export function costLine(call: Cost, session: Cost): string {
  let s = `Cost: ${costPhrase(call)}. Session total: ${costPhrase(session)}.`;
  if (call.unknown) s += " Unknown means a request reached Breachsense but the reply did not confirm whether it was counted; get_usage shows the audit log of counted requests.";
  return s;
}
