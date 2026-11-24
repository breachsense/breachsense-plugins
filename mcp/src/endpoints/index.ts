import { asm } from "./asm";
import { combo } from "./combo";
import { creds } from "./creds";
import { darkweb } from "./darkweb";
import { docs } from "./docs";
import { nhi } from "./nhi";
import { phish } from "./phish";
import { radar } from "./radar";
import { sessions } from "./sessions";
import { stealer } from "./stealer";
import type { SearchEndpoint } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const SEARCH_ENDPOINTS: SearchEndpoint<any>[] = [stealer, combo, creds, sessions, nhi, phish, darkweb, radar, docs, asm];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function byPath(path: string): SearchEndpoint<any> {
  const ep = SEARCH_ENDPOINTS.find((e) => e.path === path);
  if (!ep) throw new Error(`unknown endpoint ${path}`);
  return ep;
}

export * from "./types";
