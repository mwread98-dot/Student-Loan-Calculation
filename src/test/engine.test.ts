import { describe, expect, it } from 'vitest';
import {
  interestRate,
  mandatoryMonthlyRepayment,
  project,
  taxYearStarting,
  thresholdForTaxYear,
  writeOffDate,
} from '../domain/engine';
import { CURRENT_RPI, INTEREST_CAP, PLAN_2, POSTGRADUATE } from '../domain/rates';
import type { Assumptions, Loan, OverpaymentPlan } from '../domain/types';

const baseAssumptions: Assumptions = {
  grossAnnualSalary: 40_000,
  salaryGrowth: 0.03,
  rpi: CURRENT_RPI,
  interestCap: INTEREST_CAP,
  thresholdGrowth: 0.03,
  thresholdFreezeUntilYear: 2030,
  opportunityRate: 0.04,
  startDate: new Date(Date.UTC(2026, 8, 1)),
};

const noOverpayment: OverpaymentPlan = { lumpSum: 0, monthly: 0, target: 'auto' };

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
      { ...baseAssumptions, grossAnnualSalary: 32_000, salaryGrowth: 0.02 },
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
      { ...baseAssumptions, grossAnnualSalary: 15_000, salaryGrowth: 0 },
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
