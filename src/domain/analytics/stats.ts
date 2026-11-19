/**
 * Pure statistics for the Validation page. No React, no formatting: every
 * function takes plain numbers and returns null when the input cannot support
 * the statistic (empty sample, zero variance, n too small), so callers render
 * '—' instead of NaN.
 */

export function mean(xs: readonly number[]): number | null {
  if (xs.length === 0) return null
  let sum = 0
  for (const x of xs) sum += x
  return sum / xs.length
}

/** Sample variance (n − 1 denominator); null below two observations. */
export function variance(xs: readonly number[]): number | null {
  if (xs.length < 2) return null
  let sum = 0
  for (const x of xs) sum += x
  const m = sum / xs.length
  let ss = 0
  for (const x of xs) ss += (x - m) ** 2
  return ss / (xs.length - 1)
}

/** Sample standard deviation; null below two observations. */
export function sd(xs: readonly number[]): number | null {
  const v = variance(xs)
  return v === null ? null : Math.sqrt(v)
}

/** Standard error of the mean, sd / sqrt(n); null below two observations. */
export function se(xs: readonly number[]): number | null {
  const s = sd(xs)
  return s === null ? null : s / Math.sqrt(xs.length)
}

/**
 * One-sample t statistic of the mean against `mu0`. Null when the standard
 * error is undefined (n < 2) or zero (every value identical).
 */
export function tStat(xs: readonly number[], mu0 = 0): number | null {
  const m = mean(xs)
  const s = se(xs)
  if (m === null || s === null || s === 0) return null
  return (m - mu0) / s
}

/** Median with the two middle values averaged for even n. */
export function median(xs: readonly number[]): number | null {
  if (xs.length === 0) return null
  const sorted = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
}

/** Linear-interpolated percentile for p in [0, 1] (the numpy default). */
export function percentile(xs: readonly number[], p: number): number | null {
  if (xs.length === 0) return null
  const sorted = [...xs].sort((a, b) => a - b)
  const clamped = Math.min(1, Math.max(0, p))
  const pos = clamped * (sorted.length - 1)
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  if (lo === hi) return sorted[lo]
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

/** A confidence interval on a proportion, both bounds in [0, 1]. */
export interface Interval {
  lower: number
  upper: number
}

/**
 * Wilson score interval for k successes in n trials (z = 1.96 for 95%).
 * Unlike the normal approximation it stays inside [0, 1] and is usable at
 * n = 4. Null when n is 0.
 */
export function wilsonInterval(
  k: number,
  n: number,
  z = 1.96,
): Interval | null {
  if (!(n > 0) || k < 0 || k > n) return null
  const p = k / n
  const z2 = z * z
  const denom = 1 + z2 / n
  const centre = p + z2 / (2 * n)
  const spread = z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))
  return {
    lower: Math.max(0, (centre - spread) / denom),
    upper: Math.min(1, (centre + spread) / denom),
  }
}

/**
 * Two-proportion z statistic (pooled) for k1/n1 against k2/n2. Positive when
 * the first proportion is larger. Null when either n is 0 or the pooled
 * proportion is 0 or 1.
 */
export function twoProportionZ(
  k1: number,
  n1: number,
  k2: number,
  n2: number,
): number | null {
  if (!(n1 > 0) || !(n2 > 0)) return null
  const p1 = k1 / n1
  const p2 = k2 / n2
  const pooled = (k1 + k2) / (n1 + n2)
  const seP = Math.sqrt(pooled * (1 - pooled) * (1 / n1 + 1 / n2))
  if (seP === 0) return null
  return (p1 - p2) / seP
}

export interface WelchResult {
  t: number
  /** Welch–Satterthwaite degrees of freedom. */
  df: number
}

/**
 * Welch's unequal-variance t test of mean(a) − mean(b). Null when either
 * sample has fewer than two values or both have zero variance.
 */
export function welchT(
  a: readonly number[],
  b: readonly number[],
): WelchResult | null {
  const va = variance(a)
  const vb = variance(b)
  const ma = mean(a)
  const mb = mean(b)
  if (va === null || vb === null || ma === null || mb === null) return null
  const sa = va / a.length
  const sb = vb / b.length
  const denom = Math.sqrt(sa + sb)
  if (denom === 0) return null
  const t = (ma - mb) / denom
  const df =
    (sa + sb) ** 2 / ((sa * sa) / (a.length - 1) + (sb * sb) / (b.length - 1))
  return { t, df }
}

/** Pearson correlation; null below two pairs or when either side is constant. */
export function pearson(
  xs: readonly number[],
  ys: readonly number[],
): number | null {
  const n = Math.min(xs.length, ys.length)
  if (n < 2) return null
  let mx = 0
  let my = 0
  for (let i = 0; i < n; i++) {
    mx += xs[i]
    my += ys[i]
  }
  mx /= n
  my /= n
  let sxy = 0
  let sxx = 0
  let syy = 0
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx
    const dy = ys[i] - my
    sxy += dx * dy
    sxx += dx * dx
    syy += dy * dy
  }
  if (sxx === 0 || syy === 0) return null
  return sxy / Math.sqrt(sxx * syy)
}

/** Average ranks (1-based), ties share the mean of their rank range. */
export function ranks(xs: readonly number[]): number[] {
  const order = xs.map((_, i) => i).sort((a, b) => xs[a] - xs[b])
  const out = new Array<number>(xs.length)
  let i = 0
  while (i < order.length) {
    let j = i
    while (j + 1 < order.length && xs[order[j + 1]] === xs[order[i]]) j++
    const avg = (i + j) / 2 + 1
    for (let k = i; k <= j; k++) out[order[k]] = avg
    i = j + 1
  }
  return out
}

export interface RankCorrelation {
  rho: number
  n: number
}

/**
 * Spearman's rank correlation (Pearson on average ranks, so ties are handled).
 * Null below three pairs or when either side is constant.
 */
export function spearmanRho(
  xs: readonly number[],
  ys: readonly number[],
): RankCorrelation | null {
  const n = Math.min(xs.length, ys.length)
  if (n < 3) return null
  const rho = pearson(ranks(xs.slice(0, n)), ranks(ys.slice(0, n)))
  return rho === null ? null : { rho, n }
}
