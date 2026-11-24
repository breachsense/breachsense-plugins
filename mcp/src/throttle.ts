/** Serialises requests to at most one per interval. Reservation is synchronous, so concurrent callers queue. */
export class Throttle {
  private next = 0;
  constructor(
    private readonly intervalMs: number,
    private readonly now: () => number,
    private readonly sleep: (ms: number) => Promise<void>,
  ) {}

  async wait(): Promise<void> {
    const t = this.now();
    const at = Math.max(t, this.next);
    this.next = at + this.intervalMs;
    if (at > t) await this.sleep(at - t);
  }
}
