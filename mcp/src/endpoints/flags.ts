import type { FlagContext, Row } from "./types";

const ROLE = /^(admin|administrator|root|it|helpdesk|security|dev|devops|support|webmaster|info|sysadmin)@/i;

export function str(v: unknown): string {
  return typeof v === "string" ? v : typeof v === "number" ? String(v) : "";
}

export function credentialFlags(userField: string) {
  return (row: Row, ctx: FlagContext): string[] => {
    const out: string[] = [];
    const usr = str(row[userField]).toLowerCase();
    const pwd = str(row.pwd);
    const dom = ctx.query.replace(/^@/, "").toLowerCase();
    if (dom.includes(".") && !dom.includes("@") && usr.endsWith(`@${dom}`)) out.push("Employee account (username at the searched domain)");
    if (ROLE.test(usr)) out.push("Admin or role account");
    if (pwd && pwd.length < 8) out.push("Short password (under 8 characters)");
    return out;
  };
}
