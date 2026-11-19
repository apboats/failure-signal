import { describe, expect, it } from 'vitest'
import {
  mean,
  median,
  pearson,
  percentile,
  ranks,
  sd,
  se,
  spearmanRho,
  tStat,
  twoProportionZ,
  variance,
  welchT,
  wilsonInterval,
} from './stats'

describe('mean / variance / sd / se', () => {
  it('returns null on an empty sample and sample variance (n − 1) otherwise', () => {
    expect(mean([])).toBeNull()
    expect(mean([1, 2, 3, 4])).toBe(2.5)
    expect(variance([5])).toBeNull()
    expect(variance([1, 2, 3, 4, 5])).toBe(2.5)
    expect(sd([1, 2, 3, 4, 5])).toBeCloseTo(Math.sqrt(2.5), 12)
    expect(se([1, 2, 3, 4, 5])).toBeCloseTo(Math.sqrt(2.5) / Math.sqrt(5), 12)
  })
})

describe('tStat', () => {
  it('is mean / se against mu0 and null when the SE is zero or undefined', () => {
    expect(tStat([1, 2, 3, 4, 5])).toBeCloseTo(
      3 / (Math.sqrt(2.5) / Math.sqrt(5)),
      12,
    )
    expect(tStat([1, 2, 3, 4, 5], 3)).toBe(0)
    expect(tStat([2, 2, 2])).toBeNull()
    expect(tStat([2])).toBeNull()
  })
})

describe('median', () => {
  it('averages the two middle values for even n', () => {
    expect(median([4, 1, 3, 2])).toBe(2.5)
    expect(median([-5, -6.436])).toBeCloseTo(-5.718, 12)
  })
  it('takes the middle value for odd n and null for none', () => {
    expect(median([9, 1, 5])).toBe(5)
    expect(median([])).toBeNull()
  })
})

describe('percentile', () => {
  it('interpolates linearly between order statistics', () => {
    expect(percentile([0, 1, 2, 5, 6, 7, 8, 8.5, 9, 9, 9.5, 10], 0.8)).toBe(9)
    expect(percentile([1, 2, 3, 4], 0.5)).toBe(2.5)
    expect(percentile([1, 2, 3, 4], 0)).toBe(1)
    expect(percentile([1, 2, 3, 4], 1)).toBe(4)
    expect(percentile([], 0.8)).toBeNull()
  })
})

describe('wilsonInterval', () => {
  it('matches the textbook 7/13 interval (29%–77%) and stays inside [0, 1]', () => {
    const ci = wilsonInterval(7, 13)
    expect(ci).not.toBeNull()
    expect(ci!.lower).toBeCloseTo(0.2914, 3)
    expect(ci!.upper).toBeCloseTo(0.7679, 3)
    const none = wilsonInterval(0, 10)
    expect(none!.lower).toBe(0)
    expect(none!.upper).toBeCloseTo(0.2775, 3)
    const all = wilsonInterval(10, 10)
    expect(all!.upper).toBe(1)
    expect(all!.lower).toBeCloseTo(0.7225, 3)
    expect(wilsonInterval(4, 4)!.lower).toBeCloseTo(0.51, 2)
  })
  it('is null for n = 0 or an impossible k', () => {
    expect(wilsonInterval(0, 0)).toBeNull()
    expect(wilsonInterval(5, 4)).toBeNull()
  })
})

describe('twoProportionZ', () => {
  it('uses the pooled standard error', () => {
    expect(twoProportionZ(30, 50, 20, 50)).toBeCloseTo(2, 12)
    expect(twoProportionZ(0, 10, 0, 10)).toBeNull()
    expect(twoProportionZ(1, 0, 1, 1)).toBeNull()
  })
})

describe('welchT', () => {
  it('computes t and the Welch–Satterthwaite df', () => {
    const result = welchT([1, 2, 3, 4, 5], [2, 4, 6, 8, 10])
    expect(result).not.toBeNull()
    expect(result!.t).toBeCloseTo(-3 / Math.sqrt(2.5), 12)
    expect(result!.df).toBeCloseTo(6.25 / 1.0625, 12)
  })
  it('is null below two observations on either side or with no variance at all', () => {
    expect(welchT([1], [1, 2])).toBeNull()
    expect(welchT([1, 2], [1])).toBeNull()
    expect(welchT([2, 2], [3, 3])).toBeNull()
  })
})

describe('ranks / pearson / spearmanRho', () => {
  it('averages tied ranks', () => {
    expect(ranks([5, 6, 7, 8, 7])).toEqual([1, 2, 3.5, 5, 3.5])
  })
  it('is +1 for a monotone series, −1 reversed, and null below three pairs or when constant', () => {
    expect(spearmanRho([1, 2, 3, 4], [10, 20, 30, 40])).toEqual({
      rho: 1,
      n: 4,
    })
    expect(spearmanRho([1, 2, 3, 4], [40, 30, 20, 10])!.rho).toBeCloseTo(-1, 12)
    expect(spearmanRho([1, 2], [1, 2])).toBeNull()
    expect(spearmanRho([1, 1, 1], [1, 2, 3])).toBeNull()
  })
  it('handles ties through Pearson on average ranks', () => {
    const result = spearmanRho([1, 2, 3, 4, 5], [5, 6, 7, 8, 7])
    expect(result!.n).toBe(5)
    expect(result!.rho).toBeCloseTo(8 / Math.sqrt(95), 12)
    expect(pearson([1, 2, 3], [2, 4, 6])).toBeCloseTo(1, 12)
    expect(pearson([1], [1])).toBeNull()
  })
})
