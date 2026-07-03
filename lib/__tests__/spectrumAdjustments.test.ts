import { describe, it, expect } from "vitest";
import {
  applyModeAdjustments,
  applyMode2LocalToScreen,
  getSpectrumPivotPixels,
  overlayPercentToModeOffsets,
  getSpectrumPivotOverlayPercent,
  getSpaceCenterOverlayPercent,
  canvasOverlayPercentToStageStyle,
  clientPointToCanvasOverlayPercent,
  type PreviewGuideLayoutRects,
} from "../spectrumAdjustments";
import type { ModeAdjustments } from "../Canvas";

const identity: ModeAdjustments = {
  scaleX: 1,
  scaleY: 1,
  offsetX: 0,
  offsetY: 0,
};

describe("applyModeAdjustments", () => {
  it("returns center with identity adjustments", () => {
    const [x, y] = applyModeAdjustments(50, 50, 100, 100, identity);
    expect(x).toBe(50);
    expect(y).toBe(50);
  });

  it("applies scale", () => {
    const adj: ModeAdjustments = { ...identity, scaleX: 2, scaleY: 2 };
    const [x, y] = applyModeAdjustments(60, 60, 100, 100, adj);
    expect(x).toBe(70);
    expect(y).toBe(70);
  });

  it("applies offset", () => {
    const adj: ModeAdjustments = { ...identity, offsetX: 10 };
    const [x, y] = applyModeAdjustments(50, 50, 100, 100, adj);
    expect(x).toBe(60);
    expect(y).toBe(50);
  });
});

describe("applyMode2LocalToScreen", () => {
  it("transforms local (0,0) to screen center with identity", () => {
    const [x, y] = applyMode2LocalToScreen(0, 0, 100, 100, identity);
    expect(x).toBe(50);
    expect(y).toBe(50);
  });
});

describe("getSpectrumPivotPixels", () => {
  it("returns center for mode != 2 with identity", () => {
    const pivot = getSpectrumPivotPixels(200, 100, identity, 0);
    expect(pivot.x).toBe(100);
    expect(pivot.y).toBe(50);
  });

  it("returns center for mode 2 with identity", () => {
    const pivot = getSpectrumPivotPixels(200, 100, identity, 2);
    expect(pivot.x).toBe(100);
    expect(pivot.y).toBe(50);
  });
});

describe("overlayPercentToModeOffsets", () => {
  it("returns zero offsets for center target", () => {
    const offsets = overlayPercentToModeOffsets(50, 50, 200, 100, identity, 0);
    expect(offsets.offsetX).toBe(0);
    expect(offsets.offsetY).toBe(0);
  });

  it("returns zero for zero canvas", () => {
    const offsets = overlayPercentToModeOffsets(50, 50, 0, 0, identity, 0);
    expect(offsets.offsetX).toBe(0);
    expect(offsets.offsetY).toBe(0);
  });
});

describe("getSpectrumPivotOverlayPercent", () => {
  it("returns 50%,50% for identity adjustments", () => {
    const pct = getSpectrumPivotOverlayPercent(200, 100, identity, 0);
    expect(pct.leftPercent).toBeCloseTo(50);
    expect(pct.topPercent).toBeCloseTo(50);
  });

  it("returns 50%,50% for zero canvas", () => {
    const pct = getSpectrumPivotOverlayPercent(0, 0, identity, 0);
    expect(pct.leftPercent).toBe(50);
    expect(pct.topPercent).toBe(50);
  });
});

describe("getSpaceCenterOverlayPercent", () => {
  it("clamps to valid range", () => {
    const pct = getSpaceCenterOverlayPercent(0.5, 0.5);
    expect(pct.leftPercent).toBe(50);
    expect(pct.topPercent).toBeCloseTo(50);
  });

  it("clamps low values", () => {
    const pct = getSpaceCenterOverlayPercent(0, 0);
    expect(pct.leftPercent).toBe(5);
    expect(pct.topPercent).toBeCloseTo(8);
  });

  it("clamps high values", () => {
    const pct = getSpaceCenterOverlayPercent(1, 1);
    expect(pct.leftPercent).toBe(95);
    expect(pct.topPercent).toBeCloseTo(92);
  });
});

describe("canvasOverlayPercentToStageStyle", () => {
  const centeredLayout: PreviewGuideLayoutRects = {
    stageWidth: 800,
    stageHeight: 500,
    canvasOffsetX: 80,
    canvasOffsetY: 0,
    canvasDisplayWidth: 640,
    canvasDisplayHeight: 360,
  };

  it("maps canvas center to stage position when canvas is narrower and centered", () => {
    const style = canvasOverlayPercentToStageStyle(50, 50, centeredLayout);
    expect(parseFloat(style.left)).toBeCloseTo(50);
    expect(parseFloat(style.top)).toBeCloseTo(36);
  });

  it("maps canvas origin to canvas offset on stage", () => {
    const style = canvasOverlayPercentToStageStyle(0, 0, centeredLayout);
    expect(parseFloat(style.left)).toBeCloseTo(10);
    expect(parseFloat(style.top)).toBeCloseTo(0);
  });

  it("matches canvas percent when stage and canvas share the same box", () => {
    const layout: PreviewGuideLayoutRects = {
      stageWidth: 480,
      stageHeight: 270,
      canvasOffsetX: 0,
      canvasOffsetY: 0,
      canvasDisplayWidth: 480,
      canvasDisplayHeight: 270,
    };
    const style = canvasOverlayPercentToStageStyle(25, 75, layout);
    expect(parseFloat(style.left)).toBeCloseTo(25);
    expect(parseFloat(style.top)).toBeCloseTo(75);
  });
});

describe("clientPointToCanvasOverlayPercent", () => {
  const canvasRect = { left: 100, top: 50, width: 400, height: 200 };

  it("maps pointer at canvas center", () => {
    const pct = clientPointToCanvasOverlayPercent(300, 150, canvasRect);
    expect(pct?.leftPercent).toBeCloseTo(50);
    expect(pct?.topPercent).toBeCloseTo(50);
  });

  it("returns null for zero-sized canvas", () => {
    expect(clientPointToCanvasOverlayPercent(0, 0, { left: 0, top: 0, width: 0, height: 0 })).toBeNull();
  });
});
