export const RESULT_URI_PREFIX = "breachsense://results/";

export interface StoredResult { mimeType: string; text?: string; blob?: string }

/** Full result pages for this session, in memory only. Never written to disk. */
export class ResultStore {
  private items = new Map<string, StoredResult>();
  private seq = 0;
  constructor(private readonly max = 50) {}

  put(item: StoredResult): string {
    const id = String(++this.seq);
    this.items.set(id, item);
    while (this.items.size > this.max) {
      const oldest = this.items.keys().next().value;
      if (oldest === undefined) break;
      this.items.delete(oldest);
    }
    return `${RESULT_URI_PREFIX}${id}`;
  }

  get(id: string): StoredResult | undefined {
    return this.items.get(id);
  }
}
