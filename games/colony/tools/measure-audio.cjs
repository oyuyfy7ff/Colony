// Renders the generative music offline through the same gain chain as the game and meters it
// (audio-design skill step 8). Reports sample peak and K-weighted loudness (BS.1770 filters,
// ungated, so a rough LUFS) for day and night. Target for mobile: about -18 LUFS, peak <= -1 dBFS.
// Needs `npm run dev -- --port 5173`. Usage: node tools/measure-audio.cjs
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('http://localhost:5173/');
  const res = await page.evaluate(async () => {
    const { scheduleBar, BAR, MUSIC_TRIM, MASTER } = await import('/src/ui/audio.js');
    const { DEFAULTS } = await import('/src/ui/settings.js');
    const out = {};
    for (const [section, intensity] of [['day', 0], ['night', 1]]) {
      const bars = 16, sr = 48000;
      const ctx = new OfflineAudioContext(1, Math.ceil(sr * BAR * bars), sr);
      const master = ctx.createGain(); master.gain.value = MASTER; master.connect(ctx.destination);
      const music = ctx.createGain(); music.gain.value = DEFAULTS.music ** 2; music.connect(master);
      const melody = ctx.createGain(); melody.gain.value = MUSIC_TRIM; melody.connect(music);
      const drums = ctx.createGain(); drums.gain.value = section === 'night' ? MUSIC_TRIM * (0.35 + 0.65 * intensity) : 0; drums.connect(music);
      let seed = 1; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let b = 0; b < bars; b++) scheduleBar(ctx, melody, drums, b * BAR, b, section, rnd);
      const buf = await ctx.startRendering();
      const x = buf.getChannelData(0);
      // K-weighting: high-shelf + high-pass biquads (BS.1770 coefficients at 48 kHz)
      const biquad = (s, b0, b1, b2, a1, a2) => { const y = new Float32Array(s.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0; for (let i = 0; i < s.length; i++) { const v = b0 * s[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = s[i]; y2 = y1; y1 = v; y[i] = v; } return y; };
      const k = biquad(biquad(x, 1.53512485958697, -2.69169618940638, 1.19839281085285, -1.69065929318241, 0.73248077421585), 1, -2, 1, -1.99004745483398, 0.99007225036621);
      let peak = 0, ms = 0;
      for (let i = 0; i < x.length; i++) { peak = Math.max(peak, Math.abs(x[i])); ms += k[i] * k[i]; }
      ms /= x.length;
      out[section] = { peak_dBFS: +(20 * Math.log10(peak)).toFixed(1), loudness_LUFS_approx: +(-0.691 + 10 * Math.log10(ms)).toFixed(1) };
    }
    return out;
  });
  console.log(JSON.stringify(res));
  await browser.close();
})();
