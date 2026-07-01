import { describe, it, expect, vi } from "vitest";
import { ensureAudioContextRunning } from "../audioContext";

describe("ensureAudioContextRunning", () => {
  it("running のとき true", async () => {
    const ctx = { state: "running", resume: vi.fn() } as unknown as AudioContext;
    await expect(ensureAudioContextRunning(ctx)).resolves.toBe(true);
    expect(ctx.resume).not.toHaveBeenCalled();
  });

  it("suspended のとき resume を呼ぶ", async () => {
    const ctx = {
      state: "suspended",
      resume: vi.fn(async function (this: AudioContext) {
        (this as { state: string }).state = "running";
      }),
    } as unknown as AudioContext;
    await expect(ensureAudioContextRunning(ctx)).resolves.toBe(true);
    expect(ctx.resume).toHaveBeenCalledTimes(1);
  });

  it("closed のとき false", async () => {
    const ctx = { state: "closed", resume: vi.fn() } as unknown as AudioContext;
    await expect(ensureAudioContextRunning(ctx)).resolves.toBe(false);
  });
});
