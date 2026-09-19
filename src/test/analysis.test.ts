import { describe, expect, it } from 'vitest';
import { compare, presentValueOf, salarySensitivity } from '../domain/analysis';
import { project } from '../domain/engine';
import { CURRENT_RPI, INTEREST_CAP } from '../domain/rates';
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

describe('presentValueOf', () => {
  it('leaves a payment made today undiscounted', () => {
    const months = [
      {
        index: 0,
        date: '2026-09',
        grossAnnualSalary: 40_000,
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
      { ...baseAssumptions, grossAnnualSalary: 70_000, opportunityRate: 0 },
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
      { ...baseAssumptions, grossAnnualSalary: 32_000, salaryGrowth: 0.02 },
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
      { ...baseAssumptions, grossAnnualSalary: 80_000, opportunityRate: 0.01 },
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
      { ...baseAssumptions, grossAnnualSalary: 80_000, opportunityRate: 0.01 },
      overpayment,
    );
    const richAlternative = compare(
      loans,
      { ...baseAssumptions, grossAnnualSalary: 80_000, opportunityRate: 0.20 },
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
        opportunityRate: result.breakEvenRate!,
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
      { ...baseAssumptions, grossAnnualSalary: 45_000, opportunityRate: 0.02 },
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
