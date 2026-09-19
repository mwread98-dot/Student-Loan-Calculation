import { DAYS_PER_YEAR, PLAN_2, POSTGRADUATE } from './rates';
import type {
  Assumptions,
  Loan,
  LoanOutcome,
  LoanPlanId,
  MonthSnapshot,
  OverpaymentPlan,
  ScenarioResult,
} from './types';

const PLANS = { plan2: PLAN_2, postgrad: POSTGRADUATE } as const;

/** Safety net so a pathological input cannot spin forever. */
const MAX_MONTHS = 50 * 12;

export function planConfig(plan: LoanPlanId) {
  return PLANS[plan];
}

/**
 * The tax year a date falls in, identified by the calendar year it starts in.
 * UK tax years run 6 April to 5 April, so anything before 6 April belongs to
 * the year before.
 */
export function taxYearStarting(date: Date): number {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth(); // 0 = January
  const day = date.getUTCDate();
  const beforeApril6 = month < 3 || (month === 3 && day < 6);
  return beforeApril6 ? year - 1 : year;
}

/**
 * A repayment threshold uprated from its base year. Thresholds are held flat
 * while a freeze is in force, then grow at the assumed rate.
 */
export function thresholdForTaxYear(
  base: number,
  taxYear: number,
  baseTaxYear: number,
  freezeUntilYear: number,
  growth: number,
): number {
  // Years of uprating that have actually happened by `taxYear`.
  const firstGrowingYear = Math.max(baseTaxYear + 1, freezeUntilYear);
  const yearsOfGrowth = Math.max(0, taxYear - firstGrowingYear + 1);
  return base * Math.pow(1 + growth, yearsOfGrowth);
}

/**
 * The annual interest rate charged on a loan at a given income.
 *
 * Plan 2 tapers on a straight line from RPI at the lower threshold to RPI + 3%
 * at the upper threshold. Postgraduate loans charge RPI + 3% to everyone. Both
 * are then held down to the statutory cap.
 */
export function interestRate(
  plan: LoanPlanId,
  grossAnnualSalary: number,
  rpi: number,
  cap: number | null,
  lowerThreshold: number | null,
  upperThreshold: number | null,
): number {
  const config = PLANS[plan];
  let rate: number;

  if (lowerThreshold === null || upperThreshold === null) {
    // No taper — Postgraduate loans charge the full margin regardless of income.
    rate = rpi + config.maxMarginOverRpi;
  } else if (grossAnnualSalary <= lowerThreshold) {
    rate = rpi;
  } else if (grossAnnualSalary >= upperThreshold) {
    rate = rpi + config.maxMarginOverRpi;
  } else {
    const progress =
      (grossAnnualSalary - lowerThreshold) / (upperThreshold - lowerThreshold);
    rate = rpi + config.maxMarginOverRpi * progress;
  }

  return cap === null ? rate : Math.min(rate, cap);
}

/**
 * The mandatory monthly deduction. PAYE works out each pay period separately
 * and rounds the deduction down to whole pounds.
 */
export function mandatoryMonthlyRepayment(
  plan: LoanPlanId,
  grossAnnualSalary: number,
  annualThreshold: number,
): number {
  const monthlyGross = grossAnnualSalary / 12;
  const monthlyThreshold = annualThreshold / 12;
  const liable = Math.max(0, monthlyGross - monthlyThreshold);
  return Math.floor(liable * PLANS[plan].repaymentRate);
}

/** The April, `writeOffYears` on, at which a loan is cancelled. */
export function writeOffDate(loan: Loan): Date {
  const config = PLANS[loan.plan];
  return new Date(
    Date.UTC(loan.firstRepaymentDueYear + config.writeOffYears, 3, 6),
  );
}

/** A month as a single comparable number, so day-of-month cannot skew comparisons. */
function monthOrdinal(date: Date): number {
  return date.getUTCFullYear() * 12 + date.getUTCMonth();
}

function daysInMonth(date: Date): number {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate();
}

function isoMonth(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Run a month-by-month projection of the loans until every one is either repaid
 * or written off.
 *
 * Within each month interest is accrued first (the Student Loans Company adds
 * it daily), then the mandatory deduction is taken, then any voluntary payment.
 */
export function project(
  loans: Loan[],
  assumptions: Assumptions,
  overpayment: OverpaymentPlan,
): ScenarioResult {
  const active = loans.filter((l) => l.balance > 0);

  const state = new Map<
    LoanPlanId,
    {
      loan: Loan;
      balance: number;
      totalPaid: number;
      totalInterest: number;
      clearedDate: string | null;
      writeOffDate: string | null;
      writtenOff: number;
      writeOffAt: number;
    }
  >();

  for (const loan of active) {
    state.set(loan.plan, {
      loan,
      balance: loan.balance,
      totalPaid: 0,
      totalInterest: 0,
      clearedDate: null,
      writeOffDate: null,
      writtenOff: 0,
      writeOffAt: monthOrdinal(writeOffDate(loan)),
    });
  }

  const baseTaxYear = 2026;
  const months: MonthSnapshot[] = [];
  const cursor = new Date(
    Date.UTC(
      assumptions.startDate.getUTCFullYear(),
      assumptions.startDate.getUTCMonth(),
      1,
    ),
  );

  let totalPaid = 0;
  let totalInterest = 0;
  let totalWrittenOff = 0;
  let presentValue = 0;
  let finalPaymentDate: string | null = null;
  let lumpSumRemaining = Math.max(0, overpayment.lumpSum);

  for (let index = 0; index < MAX_MONTHS; index += 1) {
    const anyActive = [...state.values()].some((s) => s.balance > 0);
    if (!anyActive) break;

    const taxYear = taxYearStarting(cursor);
    const yearsElapsed = index / 12;
    const grossAnnualSalary =
      assumptions.grossAnnualSalary *
      Math.pow(1 + assumptions.salaryGrowth, yearsElapsed);

    let interestThisMonth = 0;
    let mandatoryThisMonth = 0;
    let voluntaryThisMonth = 0;
    let writtenOffThisMonth = 0;

    // --- Write-offs -------------------------------------------------------
    // A loan is cancelled on the April 30 years after repayments first fell
    // due; nothing more is ever paid on it.
    for (const entry of state.values()) {
      if (entry.balance > 0 && monthOrdinal(cursor) >= entry.writeOffAt) {
        writtenOffThisMonth += entry.balance;
        entry.writtenOff = entry.balance;
        entry.writeOffDate = isoMonth(cursor);
        entry.balance = 0;
      }
    }

    // --- Interest ---------------------------------------------------------
    const rates = new Map<LoanPlanId, number>();
    for (const [plan, entry] of state) {
      if (entry.balance <= 0) continue;
      const config = PLANS[plan];
      const lower =
        config.interestLowerThreshold === null
          ? null
          : thresholdForTaxYear(
              config.interestLowerThreshold,
              taxYear,
              baseTaxYear,
              assumptions.thresholdFreezeUntilYear,
              assumptions.thresholdGrowth,
            );
      const upper =
        config.interestUpperThreshold === null
          ? null
          : thresholdForTaxYear(
              config.interestUpperThreshold,
              taxYear,
              baseTaxYear,
              assumptions.thresholdFreezeUntilYear,
              assumptions.thresholdGrowth,
            );

      const annualRate = interestRate(
        plan,
        grossAnnualSalary,
        assumptions.rpi,
        assumptions.interestCap,
        lower,
        upper,
      );
      rates.set(plan, annualRate);

      // Daily compounding, matching how interest is actually added.
      const factor = Math.pow(
        1 + annualRate / DAYS_PER_YEAR,
        daysInMonth(cursor),
      );
      const interest = entry.balance * (factor - 1);
      entry.balance += interest;
      entry.totalInterest += interest;
      interestThisMonth += interest;
    }

    // --- Mandatory repayments --------------------------------------------
    // Each plan is deducted separately and they stack: holding both loans
    // means paying 9% above the Plan 2 threshold *and* 6% above £21,000.
    for (const [plan, entry] of state) {
      if (entry.balance <= 0) continue;
      const config = PLANS[plan];
      const threshold = thresholdForTaxYear(
        config.annualRepaymentThreshold,
        taxYear,
        baseTaxYear,
        assumptions.thresholdFreezeUntilYear,
        assumptions.thresholdGrowth,
      );
      const due = mandatoryMonthlyRepayment(plan, grossAnnualSalary, threshold);
      const paid = Math.min(due, entry.balance);
      entry.balance -= paid;
      entry.totalPaid += paid;
      mandatoryThisMonth += paid;
      if (entry.balance <= 0 && entry.clearedDate === null) {
        entry.clearedDate = isoMonth(cursor);
      }
    }

    // --- Voluntary overpayment -------------------------------------------
    let budget = Math.max(0, overpayment.monthly) + lumpSumRemaining;
    lumpSumRemaining = 0;

    if (budget > 0) {
      for (const plan of allocationOrder(state, rates, overpayment.target)) {
        if (budget <= 0) break;
        const entry = state.get(plan);
        if (!entry || entry.balance <= 0) continue;
        const paid = Math.min(budget, entry.balance);
        entry.balance -= paid;
        entry.totalPaid += paid;
        budget -= paid;
        voluntaryThisMonth += paid;
        if (entry.balance <= 0 && entry.clearedDate === null) {
          entry.clearedDate = isoMonth(cursor);
        }
      }
    }

    const paidThisMonth = mandatoryThisMonth + voluntaryThisMonth;
    totalPaid += paidThisMonth;
    totalInterest += interestThisMonth;
    totalWrittenOff += writtenOffThisMonth;
    presentValue +=
      paidThisMonth / Math.pow(1 + assumptions.opportunityRate, index / 12);
    if (paidThisMonth > 0) finalPaymentDate = isoMonth(cursor);

    const balances = {} as Record<LoanPlanId, number>;
    for (const plan of ['plan2', 'postgrad'] as const) {
      balances[plan] = round2(state.get(plan)?.balance ?? 0);
    }

    months.push({
      index,
      date: isoMonth(cursor),
      grossAnnualSalary: round2(grossAnnualSalary),
      balances,
      interestAccrued: round2(interestThisMonth),
      mandatoryPaid: round2(mandatoryThisMonth),
      voluntaryPaid: round2(voluntaryThisMonth),
      writtenOff: round2(writtenOffThisMonth),
    });

    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  const perLoan: LoanOutcome[] = [...state.values()].map((entry) => ({
    plan: entry.loan.plan,
    openingBalance: round2(entry.loan.balance),
    totalPaid: round2(entry.totalPaid),
    totalInterest: round2(entry.totalInterest),
    clearedDate: entry.writtenOff > 0 ? null : entry.clearedDate,
    writeOffDate: entry.writeOffDate,
    writtenOff: round2(entry.writtenOff),
  }));

  const everythingRepaid = perLoan.every((l) => l.writtenOff === 0);

  return {
    months,
    totalPaid: round2(totalPaid),
    totalInterest: round2(totalInterest),
    presentValue: round2(presentValue),
    clearedDate: everythingRepaid ? finalPaymentDate : null,
    writtenOff: round2(totalWrittenOff),
    finalPaymentDate,
    perLoan,
  };
}

/**
 * Which loan a voluntary payment should go against. 'auto' pays down the
 * higher-rate loan first, which minimises total interest; an explicit choice is
 * honoured but spills over once that loan is clear.
 */
function allocationOrder(
  state: Map<LoanPlanId, { balance: number }>,
  rates: Map<LoanPlanId, number>,
  target: OverpaymentPlan['target'],
): LoanPlanId[] {
  const plans = [...state.keys()];
  if (target !== 'auto') {
    return [target, ...plans.filter((p) => p !== target)];
  }
  return plans.sort((a, b) => (rates.get(b) ?? 0) - (rates.get(a) ?? 0));
}
