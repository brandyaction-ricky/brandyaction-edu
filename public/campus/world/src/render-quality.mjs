// Quality follows measured rendering work, never the browser name or automation state.
// Two expensive samples are required so a single initial shader compilation is harmless.
export function createRenderQuality(pixelRatio = 1, mobile = false) {
  const fullRatio = Math.min(Math.max(Number(pixelRatio) || 1, 0.5), mobile ? 1 : 1.5);
  let tier = 0;
  const samples = [];
  const settings = () => ({
    name: ['full', 'balanced', 'light'][tier],
    pixelRatio: Math.min(fullRatio, [1.5, 1, 0.65][tier]),
    shadows: tier < 2,
    shadowInterval: tier === 1 ? 200 : 0,
  });
  return {
    settings,
    record(renderMs, continuousFrameGapMs = 0) {
      if (!Number.isFinite(renderMs) || renderMs < 0) return settings();
      // An idle/hidden tab must pass zero for its gap: inactivity is not poor GPU speed.
      const cost = Math.max(renderMs, Number.isFinite(continuousFrameGapMs) ? continuousFrameGapMs / 2 : 0);
      samples.push(cost);
      if (samples.length > 4) samples.shift();
      if (tier < 2 && samples.filter(ms => ms >= 120).length >= 2) {
        tier = 2;
        samples.length = 0;
      } else if (tier < 2 && samples.filter(ms => ms >= 45).length >= 3) {
        tier++;
        samples.length = 0;
      }
      // Keep a stable quality for this visit instead of repeatedly rebuilding GPU buffers.
      return settings();
    },
  };
}
