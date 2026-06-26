import { describe, it, expect } from "vitest";
import {
  smoothstep,
  smootherstep,
  easedLerp,
  clampZoomPercent,
  normalizeSpeedSlider,
  normalizeSensitivityStep,
  pingPongSignedCosine,
  speedSliderToOneWaySeconds,
  getMotionCyclePhase,
  needsAnimatedBackgroundDraw,
  hasImageTimelineFade,
  resolveImageTimelineFadeAlpha,
  resolveStopGracefulImageAlpha,
  parseScreenMotion,
  DEFAULT_SCREEN_MOTION,
} from "../screenMotion";

describe("smoothstep", () => {
  it("returns 0 at t=0", () => expect(smoothstep(0)).toBe(0));
  it("returns 1 at t=1", () => expect(smoothstep(1)).toBe(1));
  it("returns 0.5 at t=0.5", () => expect(smoothstep(0.5)).toBeCloseTo(0.5));
  it("clamps below 0", () => expect(smoothstep(-1)).toBe(0));
  it("clamps above 1", () => expect(smoothstep(2)).toBe(1));
});

describe("smootherstep", () => {
  it("returns 0 at t=0", () => expect(smootherstep(0)).toBe(0));
  it("returns 1 at t=1", () => expect(smootherstep(1)).toBe(1));
  it("returns 0.5 at t=0.5", () => expect(smootherstep(0.5)).toBeCloseTo(0.5));
});

describe("easedLerp", () => {
  it("returns start at progress=0", () => {
    expect(easedLerp(10, 20, 0)).toBe(10);
  });
  it("returns end at progress=1", () => {
    expect(easedLerp(10, 20, 1)).toBe(20);
  });
  it("returns midpoint at progress=0.5", () => {
    expect(easedLerp(10, 20, 0.5)).toBeCloseTo(15);
  });
});

describe("clampZoomPercent", () => {
  it("clamps below minimum", () => expect(clampZoomPercent(50)).toBe(100));
  it("clamps above maximum", () => expect(clampZoomPercent(600)).toBe(500));
  it("passes through valid values", () => expect(clampZoomPercent(200)).toBe(200));
});

describe("normalizeSpeedSlider", () => {
  it("clamps below min", () => expect(normalizeSpeedSlider(0)).toBe(1));
  it("clamps above max", () => expect(normalizeSpeedSlider(15)).toBe(10));
  it("rounds to 0.1 steps", () => expect(normalizeSpeedSlider(3.33)).toBeCloseTo(3.3));
});

describe("normalizeSensitivityStep", () => {
  it("clamps below min", () => expect(normalizeSensitivityStep(-10)).toBe(-5));
  it("clamps above max", () => expect(normalizeSensitivityStep(10)).toBe(5));
  it("rounds to 0.1 steps", () => expect(normalizeSensitivityStep(1.23)).toBeCloseTo(1.2));
});

describe("pingPongSignedCosine", () => {
  it("returns -1 at phase 0", () => expect(pingPongSignedCosine(0)).toBe(-1));
  it("returns 1 at phase 0.5", () => expect(pingPongSignedCosine(0.5)).toBeCloseTo(1));
  it("returns -1 at phase 1", () => expect(pingPongSignedCosine(1)).toBeCloseTo(-1));
  it("clamps to [0,1]", () => expect(pingPongSignedCosine(-0.5)).toBe(-1));
});

describe("speedSliderToOneWaySeconds", () => {
  it("returns max seconds for slowest speed", () => {
    expect(speedSliderToOneWaySeconds(1)).toBe(120);
  });
  it("returns min seconds for fastest speed", () => {
    expect(speedSliderToOneWaySeconds(10)).toBeCloseTo(16);
  });
  it("is monotonically decreasing", () => {
    const a = speedSliderToOneWaySeconds(3);
    const b = speedSliderToOneWaySeconds(7);
    expect(a).toBeGreaterThan(b);
  });
});

describe("getMotionCyclePhase", () => {
  it("returns 0 at elapsed 0", () => {
    expect(getMotionCyclePhase(0, 5)).toBe(0);
  });
  it("wraps around cycle", () => {
    const oneWay = speedSliderToOneWaySeconds(5);
    const cycle = oneWay * 2;
    expect(getMotionCyclePhase(cycle, 5)).toBeCloseTo(0);
    expect(getMotionCyclePhase(cycle / 2, 5)).toBeCloseTo(0.5);
  });
});

describe("needsAnimatedBackgroundDraw", () => {
  it("returns false for undefined", () => {
    expect(needsAnimatedBackgroundDraw(undefined)).toBe(false);
  });
  it("returns false when disabled and no effects", () => {
    expect(needsAnimatedBackgroundDraw(DEFAULT_SCREEN_MOTION)).toBe(false);
  });
  it("returns true when motion enabled with transform", () => {
    expect(
      needsAnimatedBackgroundDraw({
        ...DEFAULT_SCREEN_MOTION,
        motionEnabled: true,
        panXPercent: 50,
      })
    ).toBe(true);
  });
  it("returns true when brightnessOnPeak", () => {
    expect(
      needsAnimatedBackgroundDraw({
        ...DEFAULT_SCREEN_MOTION,
        brightnessOnPeak: true,
      })
    ).toBe(true);
  });
});

describe("hasImageTimelineFade", () => {
  it("returns false when both are 0", () => {
    expect(hasImageTimelineFade(DEFAULT_SCREEN_MOTION)).toBe(false);
  });
  it("returns true when fadeIn > 0", () => {
    expect(
      hasImageTimelineFade({ ...DEFAULT_SCREEN_MOTION, imageFadeInSec: 1 })
    ).toBe(true);
  });
  it("returns true when fadeOut > 0", () => {
    expect(
      hasImageTimelineFade({ ...DEFAULT_SCREEN_MOTION, imageFadeOutSec: 1 })
    ).toBe(true);
  });
});

describe("resolveImageTimelineFadeAlpha", () => {
  const settings = { ...DEFAULT_SCREEN_MOTION, imageFadeInSec: 2, imageFadeOutSec: 2 };
  const duration = { elapsedSec: 10, durationSec: 12 };

  it("returns 1 when no fade settings", () => {
    expect(resolveImageTimelineFadeAlpha(DEFAULT_SCREEN_MOTION, duration)).toBe(1);
  });

  it("fades in during first fadeInSec", () => {
    const alpha = resolveImageTimelineFadeAlpha(settings, {
      elapsedSec: 1,
      durationSec: 12,
    });
    expect(alpha).toBeCloseTo(0.5);
  });

  it("fades out during last fadeOutSec", () => {
    const alpha = resolveImageTimelineFadeAlpha(settings, {
      elapsedSec: 11.5,
      durationSec: 12,
    });
    expect(alpha).toBeCloseTo(0.25);
  });
});

describe("resolveStopGracefulImageAlpha", () => {
  it("returns 1 for null state", () => {
    expect(resolveStopGracefulImageAlpha(null)).toBe(1);
  });

  it("returns 1 when fadeOutSec is 0", () => {
    expect(
      resolveStopGracefulImageAlpha({
        startPerfMs: 0,
        fadeOutSec: 0,
        startAlpha: 1,
      })
    ).toBe(1);
  });
});

describe("parseScreenMotion", () => {
  it("returns defaults for null input", () => {
    expect(parseScreenMotion(null)).toEqual(DEFAULT_SCREEN_MOTION);
  });

  it("parses valid settings", () => {
    const result = parseScreenMotion({
      motionEnabled: true,
      imageZoomPercent: 200,
      speedX: 5,
    });
    expect(result.motionEnabled).toBe(true);
    expect(result.imageZoomPercent).toBe(200);
    expect(result.speedX).toBe(5);
  });

  it("clamps out-of-range values", () => {
    const result = parseScreenMotion({
      imageZoomPercent: 999,
      speedX: 0,
    });
    expect(result.imageZoomPercent).toBe(500);
    expect(result.speedX).toBe(1);
  });
});
