import { describe, expect, it } from 'vitest';
import { compare, presentValueOf, salarySensitivity } from '../domain/analysis';
import { project } from '../domain/engine';
import {
  GILT_YIELD_10_YEAR,
  GILT_YIELD_30_YEAR,
  INTEREST_CAP,
  INTEREST_CAP_UNTIL_YEAR,
  LONG_HORIZON_YEARS,
  RPI_FORECAST,
  RPI_LONG_RUN,
  RPI_REVERSION_YEARS,
  TAX_BANDS_2026_27,
  TAX_THRESHOLD_FREEZE_UNTIL_YEAR,
} from '../domain/rates';
import type { Assumptions, Loan, OverpaymentPlan } from '../domain/types';

const baseAssumptions: Assumptions = {
  grossAnnualSalary: 40_000,
  realSalaryGrowth: 0.02,
  realGrowthYears: 10,
  rpiForecast: RPI_FORECAST,
  rpiLongRun: RPI_LONG_RUN,
  rpiReversionYears: RPI_REVERSION_YEARS,
  interestCap: INTEREST_CAP,
  interestCapUntilYear: INTEREST_CAP_UNTIL_YEAR,
  thresholdGrowth: 0.03,
  thresholdFreezeUntilYear: 2030,
  opportunityRateOverride: 0.04,
  isaAvailable: true,
  taxBands: TAX_BANDS_2026_27,
  taxThresholdFreezeUntilYear: TAX_THRESHOLD_FREEZE_UNTIL_YEAR,
  taxThresholdGrowth: 0.02,
  startDate: new Date(Date.UTC(2026, 8, 1)),
};

const noOverpayment: OverpaymentPlan = { lumpSum: 0, monthly: 0, target: 'auto' };

describe('presentValueOf', () => {
  it('leaves a payment made today undiscounted', () => {
    const months = [
      {
        index: 0,
        date: '2026-09',
        grossAnnualSalary: 40_000,
        rpi: 0.031,
        balances: { plan2: 0, postgrad: 0 },
        interestAccrued: 0,
        mandatoryPaid: 0,
        voluntaryPaid: 1_000,
        writtenOff: 0,
      },
    ];
    expect(presentValueOf(months, 0.05)).toBeCloseTo(1_000, 6);
  });

  it('discounts a payment made in a year by the full annual rate', () => {
    const months = [
      {
        index: 12,
        date: '2027-09',
        grossAnnualSalary: 40_000,
        rpi: 0.031,
        balances: { plan2: 0, postgrad: 0 },
        interestAccrued: 0,
        mandatoryPaid: 1_050,
        voluntaryPaid: 0,
        writtenOff: 0,
      },
    ];
    expect(presentValueOf(months, 0.05)).toBeCloseTo(1_000, 6);
  });

  it('equals the nominal total when money earns nothing elsewhere', () => {
    const loans: Loan[] = [
      { plan: 'plan2', balance: 15_000, firstRepaymentDueYear: 2016 },
    ];
    const result = project(
      loans,
      { ...baseAssumptions, grossAnnualSalary: 70_000, opportunityRateOverride: 0.0001 },
      noOverpayment,
    );
    expect(presentValueOf(result.months, 0)).toBeCloseTo(result.totalPaid, 1);
  });
});

describe('compare', () => {
  it('says do not overpay when the balance would be written off anyway', () => {
    const loans: Loan[] = [
      { plan: 'plan2', balance: 58_000, firstRepaymentDueYear: 2018 },
    ];
    const result = compare(
      loans,
      { ...baseAssumptions, grossAnnualSalary: 32_000, realSalaryGrowth: 0 },
      { lumpSum: 10_000, monthly: 0, target: 'auto' },
    );

    expect(result.minimumOnly.writtenOff).toBeGreaterThan(0);
    expect(result.verdict.code).toBe('do-not-overpay');
    // Every pound overpaid is a pound that would never have been collected.
    expect(result.nominalDifference).toBeGreaterThan(0);
    expect(result.presentValueSaving).toBeLessThan(0);
    expect(result.breakEvenRate).toBeNull();
  });

  it('says overpay when the loan clears anyway and charges more than the alternative', () => {
    const loans: Loan[] = [
      { plan: 'plan2', balance: 14_000, firstRepaymentDueYear: 2016 },
    ];
    const result = compare(
      loans,
      { ...baseAssumptions, grossAnnualSalary: 80_000, opportunityRateOverride: 0.01 },
      { lumpSum: 6_000, monthly: 0, target: 'auto' },
    );

    expect(result.minimumOnly.writtenOff).toBe(0);
    expect(result.verdict.code).toBe('overpay');
    expect(result.nominalDifference).toBeLessThan(0);
    expect(result.presentValueSaving).toBeGreaterThan(0);
    expect(result.monthsSaved).toBeGreaterThan(0);
  });

  it('flips to do-not-overpay when the money earns more elsewhere', () => {
    const loans: Loan[] = [
      { plan: 'plan2', balance: 14_000, firstRepaymentDueYear: 2016 },
    ];
    const overpayment: OverpaymentPlan = { lumpSum: 6_000, monthly: 0, target: 'auto' };

    const cheapAlternative = compare(
      loans,
      { ...baseAssumptions, grossAnnualSalary: 80_000, opportunityRateOverride: 0.01 },
      overpayment,
    );
    const richAlternative = compare(
      loans,
      { ...baseAssumptions, grossAnnualSalary: 80_000, opportunityRateOverride: 0.20 },
      overpayment,
    );

    expect(cheapAlternative.verdict.code).toBe('overpay');
    expect(richAlternative.verdict.code).toBe('do-not-overpay');
  });

  it('reports a break-even rate that actually equalises the two options', () => {
    const loans: Loan[] = [
      { plan: 'plan2', balance: 14_000, firstRepaymentDueYear: 2016 },
    ];
    const overpayment: OverpaymentPlan = { lumpSum: 6_000, monthly: 0, target: 'auto' };
    const result = compare(
      loans,
      { ...baseAssumptions, grossAnnualSalary: 80_000 },
      overpayment,
    );

    expect(result.breakEvenRate).not.toBeNull();
    const atBreakEven = compare(
      loans,
      {
        ...baseAssumptions,
        grossAnnualSalary: 80_000,
        opportunityRateOverride: result.breakEvenRate!,
      },
      overpayment,
    );
    expect(Math.abs(atBreakEven.presentValueSaving)).toBeLessThan(1);
  });

  it('asks for an overpayment before offering a verdict', () => {
    const loans: Loan[] = [
      { plan: 'plan2', balance: 20_000, firstRepaymentDueYear: 2018 },
    ];
    const result = compare(loans, baseAssumptions, noOverpayment);
    expect(result.verdict.code).toBe('marginal');
    expect(result.verdict.headline).toMatch(/Enter an overpayment/i);
    expect(result.overpaymentCommitted).toBe(0);
  });

  it('counts only the voluntary money actually handed over', () => {
    // A £50,000 lump sum against a £9,000 balance only ever spends £9,000.
    const loans: Loan[] = [
      { plan: 'plan2', balance: 9_000, firstRepaymentDueYear: 2016 },
    ];
    const result = compare(
      loans,
      { ...baseAssumptions, grossAnnualSalary: 70_000 },
      { lumpSum: 50_000, monthly: 0, target: 'auto' },
    );
    expect(result.overpaymentCommitted).toBeLessThanOrEqual(9_100);
  });

  it('handles a monthly overpayment as well as a lump sum', () => {
    const loans: Loan[] = [
      { plan: 'plan2', balance: 18_000, firstRepaymentDueYear: 2016 },
    ];
    const assumptions = { ...baseAssumptions, grossAnnualSalary: 75_000 };
    const result = compare(loans, assumptions, {
      lumpSum: 0,
      monthly: 300,
      target: 'auto',
    });

    expect(result.overpaymentCommitted).toBeGreaterThan(0);
    expect(result.monthsSaved).toBeGreaterThan(0);
    expect(result.withOverpayment.months[0]!.voluntaryPaid).toBe(300);
  });

  it('explains its reasoning rather than only giving a number', () => {
    const loans: Loan[] = [
      { plan: 'plan2', balance: 58_000, firstRepaymentDueYear: 2018 },
    ];
    const result = compare(
      loans,
      { ...baseAssumptions, grossAnnualSalary: 32_000 },
      { lumpSum: 10_000, monthly: 0, target: 'auto' },
    );
    expect(result.verdict.reasoning.length).toBeGreaterThan(1);
    expect(result.verdict.reasoning.join(' ')).toMatch(/written off/i);
  });
});

describe('salarySensitivity', () => {
  it('shows the verdict turning as the salary path improves', () => {
    const loans: Loan[] = [
      { plan: 'plan2', balance: 45_000, firstRepaymentDueYear: 2018 },
    ];
    const rows = salarySensitivity(
      loans,
      { ...baseAssumptions, grossAnnualSalary: 45_000, opportunityRateOverride: 0.02 },
      { lumpSum: 8_000, monthly: 0, target: 'auto' },
      [0, 0.02, 0.04, 0.06, 0.08],
    );

    expect(rows).toHaveLength(5);
    // Slow salary growth means write-off; fast growth means repaying in full.
    expect(rows[0]!.writtenOff).toBeGreaterThan(0);
    expect(rows[4]!.writtenOff).toBeLessThan(rows[0]!.writtenOff);
    // Overpaying gets steadily less bad as full repayment becomes likelier.
    expect(rows[4]!.presentValueSaving).toBeGreaterThan(rows[0]!.presentValueSaving);
  });
});

describe('chooseDiscountRate', () => {
  it('uses the 30-year gilt for a debt with decades left to run', () => {
    const loans: Loan[] = [
      { plan: 'plan2', balance: 50_000, firstRepaymentDueYear: 2019 },
    ];
    const result = compare(
      loans,
      { ...baseAssumptions, grossAnnualSalary: 32_000, opportunityRateOverride: null },
      { lumpSum: 5_000, monthly: 0, target: 'auto' },
    );

    expect(result.discountRate.basis).toBe('gilt-30');
    expect(result.discountRate.rate).toBeCloseTo(GILT_YIELD_30_YEAR, 6);
    expect(result.discountRate.horizonYears).toBeGreaterThan(LONG_HORIZON_YEARS);
  });

  it('uses the 10-year gilt for a debt that is nearly paid off', () => {
    const loans: Loan[] = [
      { plan: 'plan2', balance: 6_000, firstRepaymentDueYear: 2016 },
    ];
    const result = compare(
      loans,
      { ...baseAssumptions, grossAnnualSalary: 80_000, opportunityRateOverride: null },
      { lumpSum: 3_000, monthly: 0, target: 'auto' },
    );

    expect(result.discountRate.basis).toBe('gilt-10');
    expect(result.discountRate.rate).toBeCloseTo(GILT_YIELD_10_YEAR, 6);
    expect(result.discountRate.horizonYears).toBeLessThanOrEqual(LONG_HORIZON_YEARS);
  });

  it('honours an explicit override and says so', () => {
    const loans: Loan[] = [
      { plan: 'plan2', balance: 20_000, firstRepaymentDueYear: 2018 },
    ];
    const result = compare(
      loans,
      { ...baseAssumptions, opportunityRateOverride: 0.08 },
      { lumpSum: 5_000, monthly: 0, target: 'auto' },
    );

    expect(result.discountRate.basis).toBe('override');
    expect(result.discountRate.rate).toBeCloseTo(0.08, 6);
  });

  it('discounts both scenarios at the same rate, or the comparison is meaningless', () => {
    const loans: Loan[] = [
      { plan: 'plan2', balance: 20_000, firstRepaymentDueYear: 2018 },
    ];
    const assumptions = { ...baseAssumptions, opportunityRateOverride: null };
    const overpayment: OverpaymentPlan = { lumpSum: 5_000, monthly: 0, target: 'auto' };
    const result = compare(loans, assumptions, overpayment);

    const rate = result.discountRate.rate;
    expect(result.minimumOnly.presentValue).toBeCloseTo(
      presentValueOf(result.minimumOnly.months, rate),
      1,
    );
    expect(result.withOverpayment.presentValue).toBeCloseTo(
      presentValueOf(result.withOverpayment.months, rate),
      1,
    );
  });

  it('picks the rate from the minimum-repayment horizon, so an overpayment cannot move the goalposts', () => {
    const loans: Loan[] = [
      { plan: 'plan2', balance: 40_000, firstRepaymentDueYear: 2019 },
    ];
    const assumptions = { ...baseAssumptions, opportunityRateOverride: null };

    const small = compare(loans, assumptions, { lumpSum: 0, monthly: 0, target: 'auto' });
    const large = compare(loans, assumptions, {
      lumpSum: 35_000,
      monthly: 0,
      target: 'auto',
    });

    expect(large.discountRate.rate).toBeCloseTo(small.discountRate.rate, 6);
  });
});

describe('the ISA question', () => {
  const loans: Loan[] = [
    { plan: 'plan2', balance: 14_000, firstRepaymentDueYear: 2016 },
  ];
  // Large enough that the interest exceeds any savings allowance.
  const overpayment: OverpaymentPlan = { lumpSum: 40_000, monthly: 0, target: 'auto' };
  const earner = { ...baseAssumptions, grossAnnualSalary: 70_000, opportunityRateOverride: null };

  it('uses the gross yield when the money can sit in an ISA', () => {
    const result = compare(loans, { ...earner, isaAvailable: true }, overpayment);
    expect(result.discountRate.taxFree).toBe(true);
    expect(result.discountRate.effectiveTaxRate).toBe(0);
    expect(result.discountRate.rate).toBeCloseTo(result.discountRate.grossRate, 6);
  });

  it('docks tax from the return when it cannot', () => {
    const result = compare(loans, { ...earner, isaAvailable: false }, overpayment);
    expect(result.discountRate.taxFree).toBe(false);
    expect(result.discountRate.effectiveTaxRate).toBeGreaterThan(0.3);
    expect(result.discountRate.rate).toBeLessThan(result.discountRate.grossRate);
  });

  it('makes overpaying look better outside an ISA, because the alternative is worse', () => {
    const inIsa = compare(loans, { ...earner, isaAvailable: true }, overpayment);
    const taxed = compare(loans, { ...earner, isaAvailable: false }, overpayment);
    expect(taxed.presentValueSaving).toBeGreaterThan(inIsa.presentValueSaving);
  });

  it('barely matters on a small sum a basic rate taxpayer can shelter anyway', () => {
    // £3,000 at gilt yields throws off far less than the £1,000 allowance.
    const small: OverpaymentPlan = { lumpSum: 3_000, monthly: 0, target: 'auto' };
    const basicRate = { ...earner, grossAnnualSalary: 35_000 };
    const inIsa = compare(loans, { ...basicRate, isaAvailable: true }, small);
    const taxed = compare(loans, { ...basicRate, isaAvailable: false }, small);
    expect(taxed.discountRate.rate).toBeCloseTo(inIsa.discountRate.rate, 6);
    expect(taxed.discountRate.effectiveTaxRate).toBeCloseTo(0, 6);
  });

  it('hits a higher rate taxpayer harder than a basic rate one', () => {
    const basic = compare(
      loans,
      { ...earner, grossAnnualSalary: 35_000, isaAvailable: false },
      overpayment,
    );
    const higher = compare(
      loans,
      { ...earner, grossAnnualSalary: 70_000, isaAvailable: false },
      overpayment,
    );
    expect(higher.discountRate.effectiveTaxRate).toBeGreaterThan(
      basic.discountRate.effectiveTaxRate,
    );
  });

  it('is unaffected by the ISA question when the discount rate is overridden', () => {
    const fixed = { ...earner, opportunityRateOverride: 0.05 };
    const inIsa = compare(loans, { ...fixed, isaAvailable: true }, overpayment);
    const taxed = compare(loans, { ...fixed, isaAvailable: false }, overpayment);
    expect(inIsa.discountRate.grossRate).toBeCloseTo(0.05, 6);
    expect(taxed.discountRate.grossRate).toBeCloseTo(0.05, 6);
  });
});
