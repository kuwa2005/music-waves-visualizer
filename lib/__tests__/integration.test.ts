import { describe, it, expect } from "vitest";
import { computeStillBackgroundRect, shouldUseStillScreenBackgroundPipeline } from "../drawStillScreenBackground";
import { DEFAULT_SCREEN_MOTION, type ScreenMotionSettings } from "../screenMotion";

function makeImage(w: number, h: number): HTMLImageElement {
  return { naturalWidth: w, naturalHeight: h, width: w, height: h } as unknown as HTMLImageElement;
}

describe("結合テスト: 画面タブ × レコードプレイヤー", () => {
  describe("shouldUseStillScreenBackgroundPipeline vs recordPlayer rendering path", () => {
    it("recordPlayer is drawn only when shouldUseStillScreenBackgroundPipeline returns false", () => {
      const img = makeImage(1920, 1080);

      const settingsWithMotion: ScreenMotionSettings = {
        ...DEFAULT_SCREEN_MOTION,
        motionEnabled: true,
        imageZoomPercent: 200,
      };
      expect(
        shouldUseStillScreenBackgroundPipeline(img, settingsWithMotion, false, false)
      ).toBe(true);

      const settingsNoMotion: ScreenMotionSettings = {
        ...DEFAULT_SCREEN_MOTION,
        motionEnabled: false,
      };
      expect(
        shouldUseStillScreenBackgroundPipeline(img, settingsNoMotion, false, false)
      ).toBe(false);
    });

    it("imageTimelineFade forces still pipeline, skipping recordPlayer path", () => {
      const img = makeImage(1920, 1080);
      const settings: ScreenMotionSettings = {
        ...DEFAULT_SCREEN_MOTION,
        motionEnabled: false,
        imageFadeInSec: 1,
      };
      expect(shouldUseStillScreenBackgroundPipeline(img, settings, false, false)).toBe(true);
    });

    it("brightnessOnPeak forces still pipeline even without motion", () => {
      const img = makeImage(1920, 1080);
      const settings: ScreenMotionSettings = {
        ...DEFAULT_SCREEN_MOTION,
        motionEnabled: false,
        brightnessOnPeak: true,
      };
      expect(shouldUseStillScreenBackgroundPipeline(img, settings, false, false)).toBe(true);
    });

    it("shakeOnChorus forces still pipeline even without motion", () => {
      const img = makeImage(1920, 1080);
      const settings: ScreenMotionSettings = {
        ...DEFAULT_SCREEN_MOTION,
        motionEnabled: false,
        shakeOnChorus: true,
      };
      expect(shouldUseStillScreenBackgroundPipeline(img, settings, false, false)).toBe(true);
    });

    it("chorusZoomOnPeak forces still pipeline even without motion", () => {
      const img = makeImage(1920, 1080);
      const settings: ScreenMotionSettings = {
        ...DEFAULT_SCREEN_MOTION,
        motionEnabled: false,
        chorusZoomOnPeak: true,
      };
      expect(shouldUseStillScreenBackgroundPipeline(img, settings, false, false)).toBe(true);
    });

    it("flashOnDrop forces still pipeline even without motion", () => {
      const img = makeImage(1920, 1080);
      const settings: ScreenMotionSettings = {
        ...DEFAULT_SCREEN_MOTION,
        motionEnabled: false,
        flashOnDrop: true,
      };
      expect(shouldUseStillScreenBackgroundPipeline(img, settings, false, false)).toBe(true);
    });
  });

  describe("描画パイプライン分岐シミュレーション", () => {
    type DrawPath = "galleryTransition" | "bgVideo" | "stillScreenPipeline" | "recordPlayer" | "solidColor";

    function simulateDrawPath(
      hasGalleryTransition: boolean,
      hasBgVideo: boolean,
      stillPipelineReturns: boolean,
      hasImage: boolean,
      effectType: string | undefined
    ): DrawPath {
      if (hasGalleryTransition) return "galleryTransition";
      if (hasBgVideo) return "bgVideo";
      if (stillPipelineReturns) return "stillScreenPipeline";
      if (hasImage && effectType === "recordPlayer") return "recordPlayer";
      if (hasImage) return "recordPlayer";
      return "solidColor";
    }

    it("screen motion ON + recordPlayer → stillScreenPipeline (recordPlayer skipped)（不具合: 両方有効なときレコードプレイヤーが描画されない）", () => {
      const path = simulateDrawPath(false, false, true, true, "recordPlayer");
      expect(path).toBe("stillScreenPipeline");
    });

    it("理想: screen motion ON + recordPlayer → 両方が描画されるべき（不具合検出テスト）", () => {
      const img = makeImage(1920, 1080);
      const settingsWithMotion: ScreenMotionSettings = {
        ...DEFAULT_SCREEN_MOTION,
        motionEnabled: true,
        imageZoomPercent: 200,
      };
      const stillPipelineActive = shouldUseStillScreenBackgroundPipeline(
        img, settingsWithMotion, false, false
      );
      const recordPlayerWantsDraw = true;

      const bothDrawn = stillPipelineActive && recordPlayerWantsDraw;
      expect(bothDrawn).toBe(true);

      const recordPlayerActuallyDrawn = !stillPipelineActive && recordPlayerWantsDraw;
      expect(recordPlayerActuallyDrawn).toBe(false);
    });

    it("不具合: screen motion の音連動機能が有効なとき also にレコードプレイヤーが使えない", () => {
      const img = makeImage(1920, 1080);
      const audioFeatures: ScreenMotionSettings[] = [
        { ...DEFAULT_SCREEN_MOTION, motionEnabled: false, brightnessOnPeak: true },
        { ...DEFAULT_SCREEN_MOTION, motionEnabled: false, shakeOnChorus: true },
        { ...DEFAULT_SCREEN_MOTION, motionEnabled: false, chorusZoomOnPeak: true },
        { ...DEFAULT_SCREEN_MOTION, motionEnabled: false, flashOnDrop: true },
        { ...DEFAULT_SCREEN_MOTION, motionEnabled: false, imageFadeInSec: 1 },
      ];
      for (const s of audioFeatures) {
        const pipelineActive = shouldUseStillScreenBackgroundPipeline(img, s, false, false);
        expect(pipelineActive).toBe(true);
      }
    });

    it("screen motion OFF + recordPlayer → recordPlayer path", () => {
      const path = simulateDrawPath(false, false, false, true, "recordPlayer");
      expect(path).toBe("recordPlayer");
    });

    it("screen motion OFF + no effect → recordPlayer path (普通の画像描画)", () => {
      const path = simulateDrawPath(false, false, false, true, undefined);
      expect(path).toBe("recordPlayer");
    });

    it("gallery transition ON → galleryTransition (recordPlayer無視)", () => {
      const path = simulateDrawPath(true, false, false, true, "recordPlayer");
      expect(path).toBe("galleryTransition");
    });
  });
});

describe("結合テスト: motionEnabled と画像拡大率", () => {
  it("motionEnabled=false のとき imageZoomPercent は適用されず cover スケールと一致する", () => {
    const img = makeImage(1920, 1080);
    const canvasW = 1280;
    const canvasH = 720;

    const settings: ScreenMotionSettings = {
      ...DEFAULT_SCREEN_MOTION,
      motionEnabled: false,
      imageZoomPercent: 300,
    };

    const rect = computeStillBackgroundRect(img, canvasW, canvasH, settings, undefined);

    const coverScale = Math.max(canvasW / 1920, canvasH / 1080);
    const expectedWidth = Math.round(1920 * coverScale);
    const expectedHeight = Math.round(1080 * coverScale);

    expect(rect.width).toBe(expectedWidth);
    expect(rect.height).toBe(expectedHeight);
  });

  it("motionEnabled=true のとき imageZoomPercent が適用される", () => {
    const img = makeImage(1920, 1080);
    const canvasW = 1280;
    const canvasH = 720;

    const settings: ScreenMotionSettings = {
      ...DEFAULT_SCREEN_MOTION,
      motionEnabled: true,
      imageZoomPercent: 300,
    };

    const rect = computeStillBackgroundRect(img, canvasW, canvasH, settings, {
      elapsedSec: 5,
      durationSec: 60,
    });

    const coverScale = Math.max(canvasW / 1920, canvasH / 1080);
    const expectedWidthAt100 = Math.round(1920 * coverScale);

    expect(rect.width).toBeGreaterThan(expectedWidthAt100);
  });

  it("motionEnabled=false のとき imageZoomPercent に関わらず cover スケールと一致すべき（不具合検出テスト）", () => {
    const img = makeImage(1920, 1080);
    const canvasW = 1280;
    const canvasH = 720;

    const settings: ScreenMotionSettings = {
      ...DEFAULT_SCREEN_MOTION,
      motionEnabled: false,
      imageZoomPercent: 300,
    };

    const rect = computeStillBackgroundRect(img, canvasW, canvasH, settings, undefined);

    const coverScale = Math.max(canvasW / 1920, canvasH / 1080);
    const expectedWidth = Math.round(1920 * coverScale);
    const expectedHeight = Math.round(1080 * coverScale);

    expect(rect.width).toBe(expectedWidth);
    expect(rect.height).toBe(expectedHeight);
  });

  it("motionEnabled=false + imageZoomPercent=100 のとき cover スケールと一致", () => {
    const img = makeImage(1920, 1080);
    const canvasW = 1280;
    const canvasH = 720;

    const settings: ScreenMotionSettings = {
      ...DEFAULT_SCREEN_MOTION,
      motionEnabled: false,
      imageZoomPercent: 100,
    };

    const rect = computeStillBackgroundRect(img, canvasW, canvasH, settings, undefined);

    const coverScale = Math.max(canvasW / 1920, canvasH / 1080);
    const expectedWidth = Math.round(1920 * coverScale);
    const expectedHeight = Math.round(1080 * coverScale);

    expect(rect.width).toBe(expectedWidth);
    expect(rect.height).toBe(expectedHeight);
  });

  it("motionEnabled=false + panForwardPercent>0 のとき pan は適用されない", () => {
    const img = makeImage(1920, 1080);
    const canvasW = 1280;
    const canvasH = 720;

    const settings: ScreenMotionSettings = {
      ...DEFAULT_SCREEN_MOTION,
      motionEnabled: false,
      imageZoomPercent: 200,
      panForwardPercent: 50,
    };

    const rect1 = computeStillBackgroundRect(img, canvasW, canvasH, settings, {
      elapsedSec: 0,
      durationSec: 60,
    });
    const rect2 = computeStillBackgroundRect(img, canvasW, canvasH, settings, {
      elapsedSec: 30,
      durationSec: 60,
    });

    expect(rect1.width).toBe(rect2.width);
    expect(rect1.height).toBe(rect2.height);
  });

  it("motionEnabled=true + panForwardPercent>0 のとき経過時間でサイズが変化する", () => {
    const img = makeImage(1920, 1080);
    const canvasW = 1280;
    const canvasH = 720;

    const settings: ScreenMotionSettings = {
      ...DEFAULT_SCREEN_MOTION,
      motionEnabled: true,
      imageZoomPercent: 200,
      panForwardPercent: 50,
    };

    const rect1 = computeStillBackgroundRect(img, canvasW, canvasH, settings, {
      elapsedSec: 0,
      durationSec: 60,
    });
    const rect2 = computeStillBackgroundRect(img, canvasW, canvasH, settings, {
      elapsedSec: 15,
      durationSec: 60,
    });

    expect(rect1.width).not.toBe(rect2.width);
  });
});
