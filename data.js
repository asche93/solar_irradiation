// Synthetic monthly surface solar irradiance anomaly data (W/m^2), 1970-01 to 2026-07.
// Anomaly is expressed relative to the mean of the 1970-1999 baseline period, mirroring
// how the Copernicus temperature monitor expresses warming relative to pre-industrial levels.
//
// The underlying "true" signal is a mild, slightly accelerating upward trend (representing
// long-term brightening at the surface) with seasonal + random monthly noise layered on top
// so the scatter looks like real observations, not a clean curve.

const SOLAR_DATA = (function buildSyntheticData() {
  const DATA_START = new Date(Date.UTC(1970, 0, 1));
  const DATA_END = new Date(Date.UTC(2026, 6, 1)); // July 2026 (latest observed month)
  const BASELINE_START = new Date(Date.UTC(1970, 0, 1));
  const BASELINE_END = new Date(Date.UTC(1999, 11, 1));

  // Deterministic PRNG (mulberry32) so the "synthetic" dataset is stable across reloads.
  function mulberry32(seed) {
    let a = seed;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rng = mulberry32(20260101);

  function gaussian() {
    // Box-Muller
    let u = 0, v = 0;
    while (u === 0) u = rng();
    while (v === 0) v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  const months = [];
  let cursor = new Date(DATA_START);
  while (cursor <= DATA_END) {
    months.push(new Date(cursor));
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
  }

  // Slowly-autocorrelated noise so consecutive months don't jump independently
  // (gives the "wiggly climb" look instead of pure white noise).
  let noiseState = 0;

  const raw = months.map((d) => {
    const yearsSince1970 = (d - DATA_START) / (1000 * 60 * 60 * 24 * 365.25);

    // Mildly accelerating long-term trend -> ~+8.5 W/m^2 by mid-2026.
    const trend = 0.04 * yearsSince1970 + 0.0020 * yearsSince1970 * yearsSince1970;

    // Small residual seasonal wobble.
    const seasonal = 1.2 * Math.sin((d.getUTCMonth() / 12) * 2 * Math.PI + 0.6);

    // Autocorrelated random walk component (mean-reverting) that grows in amplitude
    // over time, echoing the widening scatter seen in the reference chart.
    const growth = 1 + yearsSince1970 / 56;
    noiseState = 0.7 * noiseState + 0.3 * gaussian();
    const wiggle = noiseState * 1.6 * growth;

    // Independent monthly jitter on top.
    const jitter = gaussian() * 0.9 * growth;

    return { date: d, raw: trend + seasonal + wiggle + jitter };
  });

  const baselineVals = raw.filter((r) => r.date >= BASELINE_START && r.date <= BASELINE_END).map((r) => r.raw);
  const baselineMean = baselineVals.reduce((a, b) => a + b, 0) / baselineVals.length;

  const series = raw.map((r) => ({ date: r.date, value: r.raw - baselineMean }));

  return {
    DATA_START,
    DATA_END,
    BASELINE_START,
    BASELINE_END,
    series,
  };
})();
