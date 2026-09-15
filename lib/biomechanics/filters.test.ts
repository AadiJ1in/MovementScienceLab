import { describe, expect, it } from "vitest";
import { OneEuroFilter } from "./filters";

describe("OneEuroFilter", () => {
  it("suppresses stationary jitter without moving far from the signal", () => {
    const filter = new OneEuroFilter({
      minCutoffHz: 1.2,
      beta: 0.02,
      derivativeCutoffHz: 1,
      resetGapMs: 750,
    });
    const raw = [30, 31.8, 28.7, 31.1, 29.1, 30.8, 29.4, 30.5];
    const filtered = raw.map((value, index) => filter.filter(value, index * 33));
    const rawRange = Math.max(...raw.slice(2)) - Math.min(...raw.slice(2));
    const filteredRange = Math.max(...filtered.slice(2)) - Math.min(...filtered.slice(2));
    expect(filteredRange).toBeLessThan(rawRange);
    expect(filtered.at(-1) ?? 0).toBeGreaterThan(29);
    expect(filtered.at(-1) ?? 0).toBeLessThan(31);
  });

  it("adapts quickly enough when the signal moves substantially", () => {
    const filter = new OneEuroFilter({
      minCutoffHz: 1,
      beta: 0.08,
      derivativeCutoffHz: 1,
      resetGapMs: 750,
    });
    [0, 0, 0, 0].forEach((value, index) => filter.filter(value, index * 33));
    const moved = filter.filter(60, 132);
    const next = filter.filter(70, 165);
    expect(moved).toBeGreaterThan(10);
    expect(next).toBeGreaterThan(moved);
  });

  it("resets after a long tracking gap instead of interpolating stale state", () => {
    const filter = new OneEuroFilter({
      minCutoffHz: 1,
      beta: 0.02,
      derivativeCutoffHz: 1,
      resetGapMs: 500,
    });
    filter.filter(10, 0);
    filter.filter(12, 33);
    expect(filter.filter(80, 1200)).toBe(80);
  });
});
