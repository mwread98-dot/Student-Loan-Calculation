import {
  interestRate,
  planConfig,
  project,
  rpiForTaxYear,
  taxYearStarting,
  thresholdForTaxYear,
} from './engine';
import {
  GILT_YIELD_10_YEAR,
  GILT_YIELD_30_YEAR,
  LONG_HORIZON_YEARS,
} from './rates';
import { bandsForTaxYear, netReturnRate } from './tax';
import type {
  Assumptions,
  Comparison,
  DiscountRate,
  Loan,
  LoanPlanId,
  MonthSnapshot,
  OverpaymentPlan,
  ScenarioResult,
  Verdict,
} from './types';

const NO_OVERPAYMENT: OverpaymentPlan = { lumpSum: 0, monthly: 0, target: 'auto' };

/** Discount a scenario's payment stream back to today at a given annual rate. */
export function presentValueOf(months: MonthSnapshot[], rate: number): number {
  let pv = 0;
  for (const month of months) {
    const paid = month.mandatoryPaid + month.voluntaryPaid;
    if (paid === 0) continue;
    pv += paid / Math.pow(1 + rate, month.index / 12);
  }
  return pv;
}

/**
 * The return the borrower's money could earn instead, used to discount both
 * scenarios.
 *
 * Gilt yields are the benchmark because the decision is between certain money
 * now and certain money later, and government bonds are the closest available
 * thing to a certain return over a fixed term. The yield is matched to the
 * term: a debt with decades left is a long-dated decision, one nearly paid off
 * is not.
 */
export function chooseDiscountRate(
  minimumOnly: ScenarioResult,
  assumptions: Assumptions,
  savedPrincipal: number,
): DiscountRate {
  const horizonYears = minimumOnly.months.length / 12;
  const long = horizonYears > LONG_HORIZON_YEARS;
  const override = assumptions.opportunityRateOverride;

  const grossRate = override ?? (long ? GILT_YIELD_30_YEAR : GILT_YIELD_10_YEAR);
  const basis: DiscountRate['basis'] =
    override !== null ? 'override' : long ? 'gilt-30' : 'gilt-10';
  const source =
    override !== null
      ? 'the return you entered'
      : long
        ? 'the 30-year gilt yield'
        : 'the 10-year gilt yield';

  if (assumptions.isaAvailable || savedPrincipal <= 0) {
    return {
      rate: grossRate,
      grossRate,
      basis,
      horizonYears,
      taxFree: true,
      effectiveTaxRate: 0,
      label: `${source}, tax free in an ISA`,
    };
  }

  // Outside an ISA the answer changes over the life of the debt: pay rises,
  // thresholds are frozen and then uprated, and the savings allowance shrinks
  // as the borrower crosses into higher bands. Averaging the after-tax rate
  // across the term reflects that drag in a single usable number.
  let total = 0;
  let years = 0;
  for (let index = 0; index < minimumOnly.months.length; index += 12) {
    const month = minimumOnly.months[index]!;
    const [year, monthNumber] = month.date.split('-').map(Number);
    const taxYear = taxYearStarting(
      new Date(Date.UTC(year ?? 2026, (monthNumber ?? 1) - 1, 15)),
    );
    const bands = bandsForTaxYear(
      assumptions.taxBands,
      taxYear,
      2026,
      assumptions.taxThresholdFreezeUntilYear,
      assumptions.taxThresholdGrowth,
    );
    total += netReturnRate(
      grossRate,
      savedPrincipal,
      month.grossAnnualSalary,
      bands,
      false,
    );
    years += 1;
  }

  const rate = years > 0 ? total / years : grossRate;
  const effectiveTaxRate = grossRate > 0 ? 1 - rate / grossRate : 0;

  return {
    rate,
    grossRate,
    basis,
    horizonYears,
    taxFree: false,
    effectiveTaxRate,
    label:
      effectiveTaxRate > 0.0005
        ? `${source} of ${formatPercent(grossRate)}, less ${formatPercent(effectiveTaxRate)} lost to tax on the interest`
        : `${source}, with the savings allowance covering the tax`,
  };
}

/**
 * Compare paying the minimum with paying the minimum plus a voluntary
 * overpayment, and say which leaves you better off.
 *
 * The comparison is done in present-value terms: every pound is discounted at
 * the rate the money would earn if you kept it instead. That is the honest way
 * to weigh money paid today against money paid in twenty years, and it makes
 * the opportunity cost of overpaying explicit rather than ignoring it.
 */
export function compare(
  loans: Loan[],
  assumptions: Assumptions,
  overpayment: OverpaymentPlan,
): Comparison {
  const minimumOnly = project(loans, assumptions, NO_OVERPAYMENT);
  const withOverpayment = project(loans, assumptions, overpayment);

  // The discount rate depends on how long the debt has left to run, and the
  // cashflows do not depend on the discount rate — so the horizon can be read
  // off the projection and fed back in without circularity. Both scenarios are
  // discounted at the same rate, or the comparison would be meaningless.
  // The money that would otherwise be kept back and earning interest. A lump
  // sum plus a year of monthly payments is what is in hand in a typical year,
  // which is the basis the savings allowance is judged against.
  const savedPrincipal =
    Math.max(0, overpayment.lumpSum) + Math.max(0, overpayment.monthly) * 12;
  const discountRate = chooseDiscountRate(minimumOnly, assumptions, savedPrincipal);
  minimumOnly.presentValue = round2(
    presentValueOf(minimumOnly.months, discountRate.rate),
  );
  withOverpayment.presentValue = round2(
    presentValueOf(withOverpayment.months, discountRate.rate),
  );

  const nominalDifference = withOverpayment.totalPaid - minimumOnly.totalPaid;
  const presentValueSaving =
    minimumOnly.presentValue - withOverpayment.presentValue;

  const overpaymentCommitted = withOverpayment.months.reduce(
    (sum, m) => sum + m.voluntaryPaid,
    0,
  );

  const monthsSaved =
    lastPayingMonth(minimumOnly) - lastPayingMonth(withOverpayment);

  const breakEvenRate = solveBreakEven(minimumOnly, withOverpayment);

  return {
    discountRate,
    minimumOnly,
    withOverpayment,
    nominalDifference: round2(nominalDifference),
    presentValueSaving: round2(presentValueSaving),
    overpaymentCommitted: round2(overpaymentCommitted),
    monthsSaved: Math.max(0, monthsSaved),
    breakEvenRate,
    verdict: buildVerdict({
      loans,
      assumptions,
      discountRate,
      minimumOnly,
      withOverpayment,
      presentValueSaving,
      nominalDifference,
      overpaymentCommitted,
      monthsSaved: Math.max(0, monthsSaved),
      breakEvenRate,
    }),
  };
}

function lastPayingMonth(scenario: ScenarioResult): number {
  for (let i = scenario.months.length - 1; i >= 0; i -= 1) {
    const month = scenario.months[i];
    if (month && month.mandatoryPaid + month.voluntaryPaid > 0) return month.index;
  }
  return 0;
}

/**
 * The opportunity rate at which the two scenarios cost exactly the same.
 *
 * Because neither payment stream depends on the discount rate, both are
 * projected once and simply re-discounted here — so this is a clean
 * one-dimensional root find rather than a re-simulation.
 */
function solveBreakEven(
  minimumOnly: ScenarioResult,
  withOverpayment: ScenarioResult,
): number | null {
  const difference = (rate: number) =>
    presentValueOf(minimumOnly.months, rate) -
    presentValueOf(withOverpayment.months, rate);

  let low = 0;
  let high = 0.5;
  const atLow = difference(low);
  const atHigh = difference(high);

  // Same sign at both ends means the answer never flips over a plausible range
  // of returns — there is no break-even to report.
  if (atLow === 0) return 0;
  if (Math.sign(atLow) === Math.sign(atHigh)) return null;

  for (let i = 0; i < 200; i += 1) {
    const mid = (low + high) / 2;
    const atMid = difference(mid);
    if (Math.sign(atMid) === Math.sign(atLow)) {
      low = mid;
    } else {
      high = mid;
    }
  }
  return (low + high) / 2;
}

interface VerdictInput {
  loans: Loan[];
  assumptions: Assumptions;
  discountRate: DiscountRate;
  minimumOnly: ScenarioResult;
  withOverpayment: ScenarioResult;
  presentValueSaving: number;
  nominalDifference: number;
  overpaymentCommitted: number;
  monthsSaved: number;
  breakEvenRate: number | null;
}

function buildVerdict(input: VerdictInput): Verdict {
  const {
    assumptions,
    discountRate,
    minimumOnly,
    withOverpayment,
    presentValueSaving,
    nominalDifference,
    overpaymentCommitted,
    monthsSaved,
    breakEvenRate,
  } = input;

  const reasoning: string[] = [];

  if (overpaymentCommitted <= 0) {
    return {
      code: 'marginal',
      headline: 'Enter an overpayment to compare',
      reasoning: [
        'Add a lump sum or a monthly overpayment above and the comparison will update.',
      ],
    };
  }

  // The single most important fact: does the loan survive to write-off?
  const writtenOffUnderMinimum = minimumOnly.writtenOff > 0;
  if (writtenOffUnderMinimum) {
    reasoning.push(
      `On minimum repayments alone, ${formatMoney(minimumOnly.writtenOff)} would be written off and never repaid. Money you overpay is money you would otherwise never have handed over.`,
    );
    if (withOverpayment.writtenOff > 0) {
      reasoning.push(
        `Even after overpaying, ${formatMoney(withOverpayment.writtenOff)} would still be written off. The overpayment does not shorten the debt at all — it only shrinks the amount eventually forgiven.`,
      );
    } else {
      reasoning.push(
        'Overpaying would clear the balance before the write-off date, turning a debt that was going to be cancelled into one you pay off in full.',
      );
    }
  } else {
    reasoning.push(
      `You are on track to clear the balance in full${
        minimumOnly.clearedDate ? ` by ${formatMonth(minimumOnly.clearedDate)}` : ''
      } even on minimum repayments, so overpaying is a question of interest saved rather than debt avoided.`,
    );
  }

  if (nominalDifference > 0) {
    reasoning.push(
      `Overpaying would mean paying ${formatMoney(nominalDifference)} more in total cash, not less.`,
    );
  } else if (nominalDifference < 0) {
    reasoning.push(
      `Overpaying cuts the total cash you hand over by ${formatMoney(-nominalDifference)}${
        monthsSaved > 0 ? ` and clears the debt ${formatDuration(monthsSaved)} sooner` : ''
      }.`,
    );
  }

  const rateSummary = currentRates(input.loans, assumptions, discountRate);
  for (const line of rateSummary) reasoning.push(line);

  if (breakEvenRate !== null) {
    reasoning.push(
      `The two options break even at a return of ${formatPercent(breakEvenRate)} AER. Beat that with your money elsewhere and keeping the cash wins; fall short and overpaying wins. The comparison uses ${formatPercent(discountRate.rate)}, ${discountRate.label}.`,
    );
  } else if (nominalDifference >= 0) {
    reasoning.push(
      'There is no rate of return at which overpaying comes out ahead — it costs more in cash terms whatever you would otherwise have done with the money.',
    );
  }

  // A saving is only worth acting on if it is material next to the sum committed.
  const materiality = Math.max(100, overpaymentCommitted * 0.02);

  if (presentValueSaving > materiality) {
    return {
      code: 'overpay',
      headline: `Overpaying looks worth it — about ${formatMoney(presentValueSaving)} better off in today's money`,
      reasoning,
    };
  }
  if (presentValueSaving < -materiality) {
    return {
      code: 'do-not-overpay',
      headline: `Stick to the minimum — overpaying costs you about ${formatMoney(-presentValueSaving)} in today's money`,
      reasoning,
    };
  }
  return {
    code: 'marginal',
    headline: 'It is close to a coin toss',
    reasoning: [
      ...reasoning,
      `The gap between the two is only ${formatMoney(Math.abs(presentValueSaving))} in today's money, which is well inside the margin of error on any salary forecast this long. Choose on how much you value being debt-free rather than on the arithmetic.`,
    ],
  };
}

/** Describe the interest each loan is charging right now, against the alternative. */
function currentRates(
  loans: Loan[],
  assumptions: Assumptions,
  discountRate: DiscountRate,
): string[] {
  const lines: string[] = [];
  const thisYearRpi = rpiForTaxYear(
    2026,
    assumptions.rpiForecast,
    assumptions.rpiLongRun,
    assumptions.rpiReversionYears,
  );
  for (const loan of loans) {
    if (loan.balance <= 0) continue;
    const config = planConfig(loan.plan);
    const lower =
      config.interestLowerThreshold === null
        ? null
        : thresholdForTaxYear(
            config.interestLowerThreshold,
            2026,
            2026,
            assumptions.thresholdFreezeUntilYear,
            assumptions.thresholdGrowth,
          );
    const upper =
      config.interestUpperThreshold === null
        ? null
        : thresholdForTaxYear(
            config.interestUpperThreshold,
            2026,
            2026,
            assumptions.thresholdFreezeUntilYear,
            assumptions.thresholdGrowth,
          );
    const rate = interestRate(
      loan.plan,
      assumptions.grossAnnualSalary,
      thisYearRpi,
      assumptions.interestCap,
      lower,
      upper,
    );
    const comparison =
      rate > discountRate.rate
        ? `above the ${formatPercent(discountRate.rate)} your money could earn risk-free`
        : `below the ${formatPercent(discountRate.rate)} your money could earn risk-free`;
    lines.push(
      `Your ${config.label} is charging ${formatPercent(rate)} at your current salary — ${comparison}.`,
    );
  }
  return lines;
}

/**
 * How the verdict holds up across a range of salary paths. The answer to this
 * question is far more sensitive to career trajectory than to anything else, so
 * it is worth showing rather than burying.
 */
export function salarySensitivity(
  loans: Loan[],
  assumptions: Assumptions,
  overpayment: OverpaymentPlan,
  growthRates: number[],
): { growth: number; presentValueSaving: number; writtenOff: number }[] {
  return growthRates.map((growth) => {
    const result = compare(
      loans,
      { ...assumptions, realSalaryGrowth: growth },
      overpayment,
    );
    return {
      growth,
      presentValueSaving: result.presentValueSaving,
      writtenOff: result.minimumOnly.writtenOff,
    };
  });
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function formatMoney(value: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function formatMonth(iso: string): string {
  const [year, month] = iso.split('-');
  if (!year || !month) return iso;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, 1));
  return date.toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function formatDuration(months: number): string {
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const parts: string[] = [];
  if (years > 0) parts.push(`${years} year${years === 1 ? '' : 's'}`);
  if (rest > 0) parts.push(`${rest} month${rest === 1 ? '' : 's'}`);
  return parts.join(' ') || 'less than a month';
}

export function planLabel(plan: LoanPlanId): string {
  return planConfig(plan).label;
}
