import { describe, expect, it } from "vitest";

import { addMonthsISO, paiseToInput, parseRupees, percent, rupees, rupeesShort, shiftMonth } from "./format";

describe("money", () => {
  it("formats paise as INR with Indian digit grouping", () => {
    expect(rupees(2_98_350_00)).toBe("₹2,98,350");
    expect(rupees(124_92)).toBe("₹124.92");
    expect(rupees(649_00, { decimals: 2 })).toBe("₹649.00");
    expect(rupees(23_000_00, { sign: true })).toBe("+₹23,000");
    expect(rupees(-4_800_00)).toBe("−₹4,800");
  });

  it("shortens goal amounts", () => {
    expect(rupeesShort(2_00_000_00)).toBe("₹2 Lakh");
    expect(rupeesShort(20_00_000_00)).toBe("₹20 Lakh");
    expect(rupeesShort(1_50_00_000_00)).toBe("₹1.5 Cr");
  });

  it("parses what people type", () => {
    expect(parseRupees("649")).toBe(649_00);
    expect(parseRupees("₹1,23,456.5")).toBe(1_23_456_50);
    expect(parseRupees("12.345")).toBeNull();
    expect(parseRupees("abc")).toBeNull();
    expect(parseRupees("")).toBeNull();
    expect(paiseToInput(124_92)).toBe("124.92");
  });

  it("formats signed percentages", () => {
    expect(percent(9.389, { sign: true })).toBe("+9.39%");
    expect(percent(-4, { sign: true })).toBe("−4.00%");
  });
});

describe("dates", () => {
  it("adds months and clamps to month end", () => {
    expect(addMonthsISO("2026-11-18", 1)).toBe("2026-12-18");
    expect(addMonthsISO("2027-01-31", 1)).toBe("2027-02-28");
    expect(addMonthsISO("2026-11-12", 3)).toBe("2027-02-12");
  });

  it("shifts months across years", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });
});
