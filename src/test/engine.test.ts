import { describe, expect, it } from 'vitest';
import {
  interestRate,
  mandatoryMonthlyRepayment,
  project,
  rpiForTaxYear,
  taxYearStarting,
  thresholdForTaxYear,
  writeOffDate,
} from '../domain/engine';
import {
  INTEREST_CAP,
  INTEREST_CAP_UNTIL_YEAR,
  PLAN_2,
  POSTGRADUATE,
  RPI_FORECAST,
  RPI_LONG_RUN,
  RPI_REVERSION_YEARS,
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
  startDate: new Date(Date.UTC(2026, 8, 1)),
};

const noOverpayment: OverpaymentPlan = { lumpSum: 0, monthly: 0, target: 'auto' };

/** project() with no overpayment, argument-ordered for readability in tests. */
const projectMinimum = (assumptions: Assumptions, loans: Loan[]) =>
  project(loans, assumptions, noOverpayment);

describe('taxYearStarting', () => {
  it('treats 6 April as the start of a new tax year', () => {
    expect(taxYearStarting(new Date(Date.UTC(2026, 3, 6)))).toBe(2026);
    expect(taxYearStarting(new Date(Date.UTC(2026, 3, 5)))).toBe(2025);
  });

  it('puts January in the tax year that began the previous April', () => {
    expect(taxYearStarting(new Date(Date.UTC(2027, 0, 15)))).toBe(2026);
  });

  it('puts December in the tax year that began that April', () => {
    expect(taxYearStarting(new Date(Date.UTC(2026, 11, 15)))).toBe(2026);
  });
});

describe('thresholdForTaxYear', () => {
  it('holds the threshold flat through the freeze', () => {
    for (const year of [2026, 2027, 2028, 2029]) {
      expect(thresholdForTaxYear(29_385, year, 2026, 2030, 0.03)).toBeCloseTo(29_385, 2);
    }
  });

  it('starts uprating in the year the freeze ends', () => {
    expect(thresholdForTaxYear(29_385, 2030, 2026, 2030, 0.03)).toBeCloseTo(
      29_385 * 1.03,
      2,
    );
    expect(thresholdForTaxYear(29_385, 2031, 2026, 2030, 0.03)).toBeCloseTo(
      29_385 * 1.03 ** 2,
      2,
    );
  });

  it('never applies negative growth years before the base year', () => {
    expect(thresholdForTaxYear(29_385, 2020, 2026, 2030, 0.03)).toBeCloseTo(29_385, 2);
  });
});

describe('interestRate', () => {
  const { interestLowerThreshold: lower, interestUpperThreshold: upper } = PLAN_2;

  it('charges plain RPI at or below the lower threshold', () => {
    expect(interestRate('plan2', 29_385, 0.041, null, lower, upper)).toBeCloseTo(0.041, 6);
    expect(interestRate('plan2', 20_000, 0.041, null, lower, upper)).toBeCloseTo(0.041, 6);
  });

  it('charges RPI + 3% at or above the upper threshold', () => {
    expect(interestRate('plan2', 52_885, 0.041, null, lower, upper)).toBeCloseTo(0.071, 6);
    expect(interestRate('plan2', 90_000, 0.041, null, lower, upper)).toBeCloseTo(0.071, 6);
  });

  it('tapers on a straight line between the thresholds', () => {
    const midpoint = (29_385 + 52_885) / 2;
    expect(interestRate('plan2', midpoint, 0.041, null, lower, upper)).toBeCloseTo(
      0.041 + 0.015,
      6,
    );
  });

  it('applies the statutory cap', () => {
    expect(interestRate('plan2', 90_000, 0.041, 0.06, lower, upper)).toBeCloseTo(0.06, 6);
  });

  it('charges postgraduate loans RPI + 3% regardless of income', () => {
    const low = interestRate('postgrad', 21_000, 0.041, null, null, null);
    const high = interestRate('postgrad', 120_000, 0.041, null, null, null);
    expect(low).toBeCloseTo(0.071, 6);
    expect(high).toBeCloseTo(0.071, 6);
  });

  it('caps postgraduate interest too', () => {
    expect(interestRate('postgrad', 25_000, 0.041, 0.06, null, null)).toBeCloseTo(0.06, 6);
  });
});

describe('mandatoryMonthlyRepayment', () => {
  it('takes nothing at or below the threshold', () => {
    expect(mandatoryMonthlyRepayment('plan2', 29_385, 29_385)).toBe(0);
    expect(mandatoryMonthlyRepayment('plan2', 20_000, 29_385)).toBe(0);
  });

  it('takes 9% of income above the Plan 2 threshold, rounded down to the pound', () => {
    // (40000 - 29385) / 12 = 884.583... ; 9% = 79.61 -> 79
    expect(mandatoryMonthlyRepayment('plan2', 40_000, 29_385)).toBe(79);
  });

  it('takes 6% of income above the postgraduate threshold', () => {
    // (40000 - 21000) / 12 = 1583.33... ; 6% = 95.0 -> 95
    expect(mandatoryMonthlyRepayment('postgrad', 40_000, 21_000)).toBe(95);
  });

  it('scales with salary', () => {
    const at60 = mandatoryMonthlyRepayment('plan2', 60_000, 29_385);
    // (60000 - 29385) / 12 = 2551.25 ; 9% = 229.61 -> 229
    expect(at60).toBe(229);
  });
});

describe('writeOffDate', () => {
  it('cancels 30 years after the April repayments first fell due', () => {
    const loan: Loan = { plan: 'plan2', balance: 1, firstRepaymentDueYear: 2018 };
    expect(writeOffDate(loan).toISOString().slice(0, 10)).toBe('2048-04-06');
  });

  it('uses the same 30-year term for postgraduate loans', () => {
    const loan: Loan = { plan: 'postgrad', balance: 1, firstRepaymentDueYear: 2020 };
    expect(writeOffDate(loan).toISOString().slice(0, 10)).toBe('2050-04-06');
    expect(POSTGRADUATE.writeOffYears).toBe(30);
  });
});

describe('project', () => {
  it('writes off a large balance on a modest salary and stops taking payments', () => {
    const loans: Loan[] = [
      { plan: 'plan2', balance: 55_000, firstRepaymentDueYear: 2018 },
    ];
    const result = project(
      loans,
      { ...baseAssumptions, grossAnnualSalary: 32_000, realSalaryGrowth: 0 },
      noOverpayment,
    );

    expect(result.writtenOff).toBeGreaterThan(0);
    expect(result.clearedDate).toBeNull();
    const outcome = result.perLoan[0]!;
    expect(outcome.writeOffDate).toBe('2048-04');
    // Nothing is ever paid after the write-off month.
    const afterWriteOff = result.months.filter((m) => m.date > '2048-04');
    expect(afterWriteOff.every((m) => m.mandatoryPaid === 0)).toBe(true);
  });

  it('clears a small balance on a high salary well before write-off', () => {
    const loans: Loan[] = [
      { plan: 'plan2', balance: 6_000, firstRepaymentDueYear: 2016 },
    ];
    const result = project(
      loans,
      { ...baseAssumptions, grossAnnualSalary: 75_000 },
      noOverpayment,
    );

    expect(result.writtenOff).toBe(0);
    expect(result.clearedDate).not.toBeNull();
    expect(result.perLoan[0]!.clearedDate).not.toBeNull();
  });

  it('deducts Plan 2 and postgraduate repayments at the same time', () => {
    const loans: Loan[] = [
      { plan: 'plan2', balance: 40_000, firstRepaymentDueYear: 2019 },
      { plan: 'postgrad', balance: 12_000, firstRepaymentDueYear: 2019 },
    ];
    const result = project(loans, baseAssumptions, noOverpayment);
    const firstMonth = result.months[0]!;

    // 9% above £29,385 plus 6% above £21,000, both from a £40,000 salary.
    expect(firstMonth.mandatoryPaid).toBe(79 + 95);
  });

  it('never takes more than the outstanding balance', () => {
    const loans: Loan[] = [
      { plan: 'plan2', balance: 50, firstRepaymentDueYear: 2016 },
    ];
    const result = project(
      loans,
      { ...baseAssumptions, grossAnnualSalary: 90_000 },
      noOverpayment,
    );
    expect(result.totalPaid).toBeLessThan(60);
    expect(result.months.every((m) => m.balances.plan2 >= 0)).toBe(true);
  });

  it('applies a lump sum immediately and shortens the term', () => {
    const loans: Loan[] = [
      { plan: 'plan2', balance: 12_000, firstRepaymentDueYear: 2016 },
    ];
    const assumptions = { ...baseAssumptions, grossAnnualSalary: 75_000 };
    const without = project(loans, assumptions, noOverpayment);
    const withLump = project(loans, assumptions, {
      lumpSum: 5_000,
      monthly: 0,
      target: 'auto',
    });

    expect(withLump.months[0]!.voluntaryPaid).toBe(5_000);
    expect(withLump.months.length).toBeLessThan(without.months.length);
    // Clearing early on a loan that would have been repaid anyway saves interest.
    expect(withLump.totalPaid).toBeLessThan(without.totalPaid);
    expect(withLump.totalInterest).toBeLessThan(without.totalInterest);
  });

  it('targets the higher-rate loan first when allocation is automatic', () => {
    const loans: Loan[] = [
      { plan: 'plan2', balance: 30_000, firstRepaymentDueYear: 2019 },
      { plan: 'postgrad', balance: 10_000, firstRepaymentDueYear: 2019 },
    ];
    // At £35,000 the Plan 2 taper gives roughly RPI + 0.7%, while the
    // postgraduate loan charges the full RPI + 3%.
    const result = project(
      loans,
      { ...baseAssumptions, grossAnnualSalary: 35_000, interestCap: null },
      { lumpSum: 4_000, monthly: 0, target: 'auto' },
    );

    const first = result.months[0]!;
    const postgradDrop = 10_000 - first.balances.postgrad;
    expect(postgradDrop).toBeGreaterThan(3_900);
  });

  it('honours an explicit overpayment target', () => {
    const loans: Loan[] = [
      { plan: 'plan2', balance: 30_000, firstRepaymentDueYear: 2019 },
      { plan: 'postgrad', balance: 10_000, firstRepaymentDueYear: 2019 },
    ];
    const result = project(loans, baseAssumptions, {
      lumpSum: 4_000,
      monthly: 0,
      target: 'plan2',
    });

    const first = result.months[0]!;
    expect(first.balances.postgrad).toBeGreaterThan(9_800);
    expect(first.balances.plan2).toBeLessThan(26_500);
  });

  it('spills an overpayment onto the other loan once the target is clear', () => {
    const loans: Loan[] = [
      { plan: 'plan2', balance: 30_000, firstRepaymentDueYear: 2019 },
      { plan: 'postgrad', balance: 2_000, firstRepaymentDueYear: 2019 },
    ];
    const result = project(loans, baseAssumptions, {
      lumpSum: 10_000,
      monthly: 0,
      target: 'postgrad',
    });

    const first = result.months[0]!;
    expect(first.balances.postgrad).toBe(0);
    // The remaining ~£8,000 lands on the Plan 2 balance.
    expect(first.balances.plan2).toBeLessThan(22_500);
  });

  it('accrues interest before taking the monthly payment', () => {
    const loans: Loan[] = [
      { plan: 'plan2', balance: 10_000, firstRepaymentDueYear: 2019 },
    ];
    const result = project(loans, baseAssumptions, noOverpayment);
    const first = result.months[0]!;
    expect(first.interestAccrued).toBeGreaterThan(0);
    expect(first.balances.plan2).toBeCloseTo(
      10_000 + first.interestAccrued - first.mandatoryPaid,
      2,
    );
  });

  it('terminates rather than running forever when nothing is ever repaid', () => {
    const loans: Loan[] = [
      { plan: 'plan2', balance: 60_000, firstRepaymentDueYear: 2024 },
    ];
    const result = project(
      loans,
      { ...baseAssumptions, grossAnnualSalary: 15_000, realSalaryGrowth: 0, realGrowthYears: 0 },
      noOverpayment,
    );
    expect(result.months.length).toBeLessThanOrEqual(50 * 12);
    expect(result.writtenOff).toBeGreaterThan(0);
    expect(result.totalPaid).toBe(0);
  });

  it('uses the Plan 2 repayment threshold from the rates module', () => {
    expect(PLAN_2.annualRepaymentThreshold).toBe(29_385);
    expect(PLAN_2.repaymentRate).toBe(0.09);
    expect(POSTGRADUATE.annualRepaymentThreshold).toBe(21_000);
    expect(POSTGRADUATE.repaymentRate).toBe(0.06);
  });
});

describe('rpiForTaxYear', () => {
  const forecast = [
    { taxYear: 2026, rate: 0.031 },
    { taxYear: 2027, rate: 0.029 },
    { taxYear: 2028, rate: 0.029 },
    { taxYear: 2029, rate: 0.029 },
  ];

  it('uses the published forecast where there is one', () => {
    expect(rpiForTaxYear(2026, forecast, 0.022, 3)).toBeCloseTo(0.031, 6);
    expect(rpiForTaxYear(2029, forecast, 0.022, 3)).toBeCloseTo(0.029, 6);
  });

  it('holds the first forecast value for anything earlier', () => {
    expect(rpiForTaxYear(2020, forecast, 0.022, 3)).toBeCloseTo(0.031, 6);
  });

  it('glides from the last forecast year down to the long-run anchor', () => {
    // 2.9% -> 2.2% over three years.
    expect(rpiForTaxYear(2030, forecast, 0.022, 3)).toBeCloseTo(0.029 - 0.007 / 3, 6);
    expect(rpiForTaxYear(2031, forecast, 0.022, 3)).toBeCloseTo(0.029 - (0.007 * 2) / 3, 6);
  });

  it('sits at the anchor once the reversion is complete, and stays there', () => {
    expect(rpiForTaxYear(2032, forecast, 0.022, 3)).toBeCloseTo(0.022, 6);
    expect(rpiForTaxYear(2055, forecast, 0.022, 3)).toBeCloseTo(0.022, 6);
  });

  it('steps straight to the anchor when no reversion period is allowed', () => {
    expect(rpiForTaxYear(2030, forecast, 0.022, 0)).toBeCloseTo(0.022, 6);
  });

  it('falls back to the anchor with no forecast at all', () => {
    expect(rpiForTaxYear(2026, [], 0.022, 3)).toBeCloseTo(0.022, 6);
  });
});

describe('the interest cap', () => {
  const loans: Loan[] = [
    { plan: 'postgrad', balance: 20_000, firstRepaymentDueYear: 2021 },
  ];
  const borrower = { ...baseAssumptions, grossAnnualSalary: 30_000 };

  it('binds only where RPI plus the margin would exceed it', () => {
    // A postgraduate loan charges RPI + 3% flat, so the cap bites at RPI > 3%.
    expect(interestRate('postgrad', 30_000, 0.022, 0.06, null, null)).toBeCloseTo(0.052, 6);
    expect(interestRate('postgrad', 30_000, 0.05, 0.06, null, null)).toBeCloseTo(0.06, 6);
  });

  it('costs more once it lapses, when inflation is high enough for it to bite', () => {
    const highInflation = { ...borrower, rpiLongRun: 0.05 };
    const lapses = projectMinimum({ ...highInflation, interestCapUntilYear: 2027 }, loans);
    const persists = projectMinimum({ ...highInflation, interestCapUntilYear: 2060 }, loans);
    expect(lapses.totalInterest).toBeGreaterThan(persists.totalInterest);
  });

  it('makes almost no difference on the current forecast, because it never binds', () => {
    // RPI is forecast at 2.9% falling to 2.2%, so RPI + 3% peaks around 5.9% —
    // under the 6% cap. Whether the cap lapses is close to irrelevant here, and
    // was only ever material because a frozen 4.1% RPI pushed the rate above it.
    const lapses = projectMinimum({ ...borrower, interestCapUntilYear: 2027 }, loans);
    const persists = projectMinimum({ ...borrower, interestCapUntilYear: 2060 }, loans);
    expect(lapses.totalInterest).toBeCloseTo(persists.totalInterest, 0);
  });

  it('still charges more the higher inflation runs, cap or no cap', () => {
    // Inflation reaches the balance through pay as well as interest, so it can
    // never be fully masked — unlike under a frozen RPI.
    const low = projectMinimum({ ...borrower, rpiLongRun: 0.02 }, loans);
    const high = projectMinimum({ ...borrower, rpiLongRun: 0.06 }, loans);
    expect(high.totalInterest).toBeGreaterThan(low.totalInterest);
  });
});

describe('real salary growth', () => {
  const loans: Loan[] = [
    { plan: 'plan2', balance: 40_000, firstRepaymentDueYear: 2019 },
  ];

  it('starts at exactly the salary entered', () => {
    const result = projectMinimum(baseAssumptions, loans);
    expect(result.months[0]!.grossAnnualSalary).toBeCloseTo(40_000, 0);
  });

  it('grows faster than inflation only while the growth period lasts', () => {
    const result = projectMinimum(
      { ...baseAssumptions, realSalaryGrowth: 0.02, realGrowthYears: 5 },
      loans,
    );
    const realTerms = (index: number) => {
      // Deflate the nominal salary by the inflation actually applied.
      let deflator = 1;
      for (let i = 1; i <= index; i += 1) {
        deflator *= Math.pow(1 + result.months[i]!.rpi, 1 / 12);
      }
      return result.months[index]!.grossAnnualSalary / deflator;
    };

    const atStart = realTerms(0);
    const atFive = realTerms(60);
    const atTwenty = realTerms(240);

    // Roughly 2% a year for five years, then flat in real terms.
    expect(atFive / atStart).toBeCloseTo(Math.pow(1.02, 5), 1);
    expect(atTwenty / atFive).toBeCloseTo(1, 1);
  });

  it('keeps pace with inflation after the growth period ends', () => {
    const result = projectMinimum(
      { ...baseAssumptions, realSalaryGrowth: 0, realGrowthYears: 0 },
      loans,
    );
    // Nominal pay still rises, because inflation does.
    expect(result.months[120]!.grossAnnualSalary).toBeGreaterThan(40_000);
  });

  it('leaves pay flat in cash terms when there is neither inflation nor real growth', () => {
    const result = projectMinimum(
      {
        ...baseAssumptions,
        realSalaryGrowth: 0,
        realGrowthYears: 0,
        rpiForecast: [],
        rpiLongRun: 0,
      },
      loans,
    );
    expect(result.months[120]!.grossAnnualSalary).toBeCloseTo(40_000, 0);
  });
});
