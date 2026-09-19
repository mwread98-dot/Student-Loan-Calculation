import { describe, expect, it } from 'vitest';
import {
  bandsForTaxYear,
  netReturnRate,
  personalAllowance,
  personalSavingsAllowance,
  taxOnSavingsInterest,
} from '../domain/tax';
import { TAX_BANDS_2026_27 } from '../domain/rates';

const bands = TAX_BANDS_2026_27;

describe('personalAllowance', () => {
  it('is the full allowance below the taper', () => {
    expect(personalAllowance(50_000, bands)).toBe(12_570);
    expect(personalAllowance(100_000, bands)).toBe(12_570);
  });

  it('withdraws £1 for every £2 above £100,000', () => {
    expect(personalAllowance(110_000, bands)).toBe(12_570 - 5_000);
    expect(personalAllowance(112_000, bands)).toBe(12_570 - 6_000);
  });

  it('is gone entirely by £125,140', () => {
    expect(personalAllowance(125_140, bands)).toBe(0);
    expect(personalAllowance(200_000, bands)).toBe(0);
  });
});

describe('personalSavingsAllowance', () => {
  it('is £1,000 for a basic rate taxpayer', () => {
    expect(personalSavingsAllowance(40_000, bands)).toBe(1_000);
    expect(personalSavingsAllowance(50_270, bands)).toBe(1_000);
  });

  it('halves to £500 at the higher rate', () => {
    expect(personalSavingsAllowance(60_000, bands)).toBe(500);
  });

  it('disappears at the additional rate', () => {
    expect(personalSavingsAllowance(130_000, bands)).toBe(0);
  });
});

describe('taxOnSavingsInterest', () => {
  it('takes nothing when the savings allowance covers the interest', () => {
    // £40,000 salary is basic rate, so £1,000 of interest is covered.
    expect(taxOnSavingsInterest(500, 40_000, bands)).toBeCloseTo(0, 6);
    expect(taxOnSavingsInterest(1_000, 40_000, bands)).toBeCloseTo(0, 6);
  });

  it('taxes the excess over the allowance at the basic rate', () => {
    // £1,500 interest: £1,000 free, £500 at 20%.
    expect(taxOnSavingsInterest(1_500, 40_000, bands)).toBeCloseTo(100, 6);
  });

  it('gives a higher rate taxpayer only £500 free, then charges 40%', () => {
    // £60,000 salary: £500 free, £500 at 40%.
    expect(taxOnSavingsInterest(1_000, 60_000, bands)).toBeCloseTo(200, 6);
  });

  it('gives an additional rate taxpayer no allowance at all', () => {
    // £150,000 salary: the whole £1,000 at 45%.
    expect(taxOnSavingsInterest(1_000, 150_000, bands)).toBeCloseTo(450, 6);
  });

  it('applies the starting rate band for savings to a low earner', () => {
    // £15,000 salary leaves £2,570 of the £5,000 starting rate band, plus the
    // £1,000 allowance — £3,570 of interest before any tax is due.
    expect(taxOnSavingsInterest(3_000, 15_000, bands)).toBeCloseTo(0, 6);
    expect(taxOnSavingsInterest(3_570, 15_000, bands)).toBeCloseTo(0, 6);
    expect(taxOnSavingsInterest(4_000, 15_000, bands)).toBeCloseTo(430 * 0.2, 6);
  });

  it('uses leftover personal allowance when pay is below it', () => {
    // £10,000 salary leaves £2,570 of allowance, then £5,000 starting rate and
    // £1,000 savings allowance on top.
    expect(taxOnSavingsInterest(8_000, 10_000, bands)).toBeCloseTo(0, 6);
  });

  it('accounts for the tapered allowance above £100,000', () => {
    // £110,000 salary: allowance down to £6,570, still higher rate, so £500 of
    // the £2,000 is free and £1,500 is taxed at 40%.
    expect(taxOnSavingsInterest(2_000, 110_000, bands)).toBeCloseTo(600, 6);
  });

  it('straddles bands when interest pushes income over a threshold', () => {
    // £49,000 salary plus £4,000 interest crosses £50,270, so the taxpayer is
    // a higher rate one: £500 free, £770 at 20% filling the basic band, then
    // the remaining £2,730 at 40%.
    const tax = taxOnSavingsInterest(4_000, 49_000, bands);
    expect(tax).toBeCloseTo(770 * 0.2 + 2_730 * 0.4, 6);
  });

  it('charges nothing on nothing', () => {
    expect(taxOnSavingsInterest(0, 40_000, bands)).toBe(0);
    expect(taxOnSavingsInterest(-100, 40_000, bands)).toBe(0);
  });
});

describe('netReturnRate', () => {
  it('keeps the whole return inside an ISA', () => {
    expect(netReturnRate(0.0575, 50_000, 60_000, bands, true)).toBeCloseTo(0.0575, 6);
  });

  it('keeps the whole return outside one when the allowance covers it', () => {
    // £5,000 at 5.75% is £287 of interest, well inside a basic rate £1,000.
    expect(netReturnRate(0.0575, 5_000, 40_000, bands, false)).toBeCloseTo(0.0575, 6);
  });

  it('loses close to the marginal rate once the allowance is used up', () => {
    // £200,000 earning 5.75% swamps the £500 higher rate allowance.
    const net = netReturnRate(0.0575, 200_000, 60_000, bands, false);
    expect(net).toBeGreaterThan(0.0575 * 0.6);
    expect(net).toBeLessThan(0.0575 * 0.62);
  });

  it('leaves a higher rate taxpayer worse off than a basic rate one', () => {
    const basic = netReturnRate(0.0575, 60_000, 40_000, bands, false);
    const higher = netReturnRate(0.0575, 60_000, 60_000, bands, false);
    const additional = netReturnRate(0.0575, 60_000, 150_000, bands, false);
    expect(basic).toBeGreaterThan(higher);
    expect(higher).toBeGreaterThan(additional);
  });

  it('falls back to the gross rate with nothing invested', () => {
    expect(netReturnRate(0.0575, 0, 40_000, bands, false)).toBeCloseTo(0.0575, 6);
  });
});

describe('bandsForTaxYear', () => {
  it('holds thresholds flat through the freeze', () => {
    for (const year of [2026, 2027, 2029, 2030]) {
      expect(bandsForTaxYear(bands, year, 2026, 2031, 0.02).personalAllowance).toBe(
        12_570,
      );
    }
  });

  it('uprates once the freeze ends', () => {
    expect(
      bandsForTaxYear(bands, 2031, 2026, 2031, 0.02).personalAllowance,
    ).toBeCloseTo(12_570 * 1.02, 4);
    expect(
      bandsForTaxYear(bands, 2033, 2026, 2031, 0.02).higherRateThreshold,
    ).toBeCloseTo(50_270 * 1.02 ** 3, 4);
  });

  it('leaves the rates themselves alone', () => {
    const later = bandsForTaxYear(bands, 2040, 2026, 2031, 0.02);
    expect(later.basicRate).toBe(0.2);
    expect(later.higherRate).toBe(0.4);
    expect(later.additionalRate).toBe(0.45);
    expect(later.psaAdditional).toBe(0);
  });

  it('drags a frozen-threshold taxpayer into a higher band as pay rises', () => {
    // Pay of £55,000 in a world where thresholds never moved is higher rate;
    // uprate the thresholds enough and the same pay is basic rate again.
    const frozen = bandsForTaxYear(bands, 2040, 2026, 2031, 0);
    const uprated = bandsForTaxYear(bands, 2040, 2026, 2031, 0.05);
    // The allowances are uprated alongside the thresholds, so compare against
    // each set's own figures: what changes is which band £55,000 lands in.
    expect(personalSavingsAllowance(55_000, frozen)).toBe(frozen.psaHigher);
    expect(personalSavingsAllowance(55_000, uprated)).toBe(uprated.psaBasic);
    expect(uprated.psaBasic).toBeGreaterThan(frozen.psaBasic);
  });
});
