import { expect, it } from "vitest";
import { Throttle } from "../src/throttle";

it("spaces calls by the interval, including concurrent ones", async () => {
  let t = 1000;
  const slept: number[] = [];
  const th = new Throttle(1000, () => t, async (ms) => { slept.push(ms); });
  await Promise.all([th.wait(), th.wait(), th.wait()]);
  expect(slept).toEqual([1000, 2000]);
  t = 10_000;
  await th.wait();
  expect(slept).toEqual([1000, 2000]);
});
