import type { z } from "zod";

export type Params = Record<string, string | true>;
export type Row = Record<string, unknown>;
export interface FlagContext { query: string; today: Date }

export interface Display {
  /** Human label, e.g. "stealer logs". */
  label: string;
  /** Candidate date fields, first present wins; used for sorting and freshness. */
  dateFields: string[];
  /** Fields kept in the top rows, in display order. Empty = keep all fields. */
  fields: string[];
  flags?: (row: Row, ctx: FlagContext) => string[];
  /** One suggestion shown when there are no matches. */
  emptyHint: string;
}

export interface Built { params: Params; query: string }

export interface SearchEndpoint<S extends z.ZodRawShape = z.ZodRawShape> {
  tool: string;
  title: string;
  description: string;
  path: string;
  shape: S;
  build: (args: z.infer<z.ZodObject<S>>) => Built | { error: string };
  display: Display;
}

export function defineSearch<S extends z.ZodRawShape>(def: SearchEndpoint<S>): SearchEndpoint<S> {
  return def;
}
