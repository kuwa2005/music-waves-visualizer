import { describe, it, expect, beforeEach } from "vitest";
import {
  advanceRecordDiscRotation,
  clearRecordPlayerCache,
  tonearmNeedleRadiusRatio,
} from "../recordPlayer";

describe("recordPlayer rotation", () => {
  beforeEach(() => {
    clearRecordPlayerCache();
  });

  it("stays at 0 when stopped", () => {
    expect(advanceRecordDiscRotation(3, false, 16, 0)).toBe(0);
    expect(advanceRecordDiscRotation(3, false, 16, 0)).toBe(0);
  });

  it("accumulates angle while playing using frame delta", () => {
    const a1 = advanceRecordDiscRotation(60, true, 100, 0);
    const a2 = advanceRecordDiscRotation(60, true, 100, 0);
    expect(a2).toBeGreaterThan(a1);
    expect(a2 - a1).toBeCloseTo(36, 0);
  });

  it("syncs to elapsedSec when stopped after playback", () => {
    advanceRecordDiscRotation(60, true, 100, 0);
    expect(advanceRecordDiscRotation(60, false, 0, 0.5)).toBeCloseTo(180, 0);
  });

  it("keeps angle when playing with zero delta", () => {
    const first = advanceRecordDiscRotation(3, true, 100, 0);
    expect(advanceRecordDiscRotation(3, true, 0, 0)).toBe(first);
  });
});

describe("recordPlayer tonearm", () => {
  beforeEach(() => {
    clearRecordPlayerCache();
  });

  it("drops needle at the outer disc edge when fully lowered", () => {
    const outerRatio = tonearmNeedleRadiusRatio(1, 0);
    expect(outerRatio).toBeCloseTo(1, 2);
  });

  it("was previously too far inside the outer edge before arm length fix", () => {
    const pivotX = 500 + 560 * 0.8;
    const pivotY = 500 - 560 * 0.8;
    const discRadius = 480;
    const angle5 = (5 * 30 - 90) * (Math.PI / 180);
    const tipPlayX = 500 + discRadius * Math.cos(angle5);
    const tipPlayY = 500 + discRadius * Math.sin(angle5);
    const oldArmLength = Math.hypot(tipPlayX - pivotX, tipPlayY - pivotY) * 0.88;
    const playAngle = Math.atan2(tipPlayY - pivotY, tipPlayX - pivotX);
    const headX = pivotX + oldArmLength * Math.cos(playAngle);
    const headY = pivotY + oldArmLength * Math.sin(playAngle);
    const oldRatio = Math.hypot(headX - 500, headY - 500) / discRadius;
    expect(oldRatio).toBeLessThan(0.95);
    expect(tonearmNeedleRadiusRatio(1, 0)).toBeGreaterThan(oldRatio);
  });

  it("moves inward as groove position advances during playback", () => {
    const start = tonearmNeedleRadiusRatio(1, 0);
    const mid = tonearmNeedleRadiusRatio(1, 0.5);
    const end = tonearmNeedleRadiusRatio(1, 1);
    expect(start).toBeCloseTo(1, 2);
    expect(mid).toBeLessThan(start);
    expect(end).toBeLessThan(mid);
    expect(end).toBeLessThan(0.75);
  });
});
