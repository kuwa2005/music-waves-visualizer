/** ユーザー操作後に AudioContext を running へ遷移させる */
export async function ensureAudioContextRunning(
  ctx: AudioContext | null | undefined
): Promise<boolean> {
  if (!ctx) return false;
  if (ctx.state === "running") return true;
  if (ctx.state === "closed") return false;
  try {
    await ctx.resume();
    return true;
  } catch {
    return false;
  }
}
