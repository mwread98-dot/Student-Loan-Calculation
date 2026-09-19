/**
 * Statutory figures for UK income-contingent student loans.
 *
 * EVERY government-set number the calculator relies on lives in this file, so
 * there is exactly one place to update when the rates change (they change every
 * April for thresholds, and every September for interest).
 *
 * Sources, checked September 2026:
 *  - Repayment thresholds and rates:
 *    https://www.gov.uk/repaying-your-student-loan/what-you-pay
 *  - Interest rates and the 6% cap announced 7 April 2026:
 *    https://www.gov.uk/government/news/interest-rate-cap-introduced-to-protect-plan-2-borrowers
 *  - Write-off rules:
 *    https://www.gov.uk/repaying-your-student-loan/when-your-student-loan-gets-written-off-or-cancelled
 *  - Interest mechanics and the upper interest threshold:
 *    https://commonslibrary.parliament.uk/research-briefings/cbp-10654/
 */

/** The tax year these defaults describe, for display in the UI. */
export const RATES_TAX_YEAR = '2026/27';

/** When this file was last checked against the sources above. */
export const RATES_LAST_CHECKED = '2026-09-19';

export const PLAN_2 = {
  id: 'plan2',
  label: 'Plan 2',
  blurb:
    'Undergraduate loan for students in England or Wales who started their course between 1 September 2012 and 31 July 2023.',
  /** Annual income above which repayments start (2026/27). */
  annualRepaymentThreshold: 29_385,
  /** Share of income above the threshold that is repaid. */
  repaymentRate: 0.09,
  /**
   * Plan 2 interest is income-tapered: RPI at or below the lower threshold,
   * rising on a straight line to RPI + 3% at or above the upper threshold.
   * The lower threshold tracks the repayment threshold.
   */
  interestLowerThreshold: 29_385,
  interestUpperThreshold: 52_885,
  /** Maximum margin over RPI, reached at the upper threshold. */
  maxMarginOverRpi: 0.03,
  /** Years after the first April you were due to repay, at which the balance is cancelled. */
  writeOffYears: 30,
} as const;

export const POSTGRADUATE = {
  id: 'postgrad',
  label: 'Postgraduate Loan',
  blurb:
    "Master's or doctoral loan for students in England or Wales. Officially repayment Plan 3.",
  annualRepaymentThreshold: 21_000,
  repaymentRate: 0.06,
  /**
   * Postgraduate interest is a flat RPI + 3% for everyone — unlike Plan 2 there
   * is no income taper, so the lower and upper thresholds are not used.
   */
  interestLowerThreshold: null,
  interestUpperThreshold: null,
  maxMarginOverRpi: 0.03,
  writeOffYears: 30,
} as const;

/**
 * RPI feeding student loan interest, by the tax year it applies from.
 *
 * These are the OBR's March 2026 published forecasts, not a guess: RPI falls
 * from 4.1% in 2025 to 3.1% in 2026, then averages 2.9% a year to 2029.
 * https://obr.uk/efo/economic-and-fiscal-outlook-march-2026/
 */
export const RPI_FORECAST: { taxYear: number; rate: number }[] = [
  { taxYear: 2026, rate: 0.031 },
  { taxYear: 2027, rate: 0.029 },
  { taxYear: 2028, rate: 0.029 },
  { taxYear: 2029, rate: 0.029 },
];

/**
 * Where RPI settles once the forecast runs out.
 *
 * This is deliberately well below RPI's historic average, because RPI as we
 * know it ends. From February 2030 it is calculated as CPIH, a measure that
 * has run roughly 0.8 to 1.0 percentage points below RPI. Anchoring on the
 * Bank of England's 2% CPI target plus the small housing-costs wedge that
 * separates CPIH from CPI gives 2.2%.
 *
 * For a loan that runs to the 2040s or 2050s this assumption matters more than
 * any near-term forecast, because it governs almost the whole term.
 * https://www.which.co.uk/news/article/rpi-inflation-reform-what-it-means-for-pensions-student-loans-rail-fares-and-more-aPSks1x3edLp
 */
export const RPI_LONG_RUN = 0.022;

/**
 * Years taken to travel from the last forecast value to the long-run anchor.
 * The 2030 reform is a hard definitional change rather than a drift, so this
 * is short by design; it exists to avoid an implausible cliff-edge rather than
 * to model a slow convergence.
 */
export const RPI_REVERSION_YEARS = 3;

/**
 * The government caps student loan interest at the prevailing market rate for
 * comparable unsecured lending. A headline 6% cap was announced for both Plan
 * 2 and Postgraduate loans covering 1 September 2026 to 31 August 2027.
 */
export const INTEREST_CAP = 0.06;

/**
 * The September the cap is assumed to stop applying. Interest years run 1
 * September to 31 August, and the announced cap covers one of them, so the
 * default assumes exactly what has been announced and no more.
 *
 * Some cap has been in force continuously since 2023, so assuming it lapses
 * may understate the borrower's luck; assuming it never lapses understates
 * the interest. Neither is knowable, which is why it is an editable input
 * rather than a constant.
 */
export const INTEREST_CAP_UNTIL_YEAR = 2027;

/**
 * Gilt yields used as the risk-free return the borrower's money could earn
 * instead — the discount rate. Government bonds are the right benchmark
 * because they are the closest thing to a certain return over a fixed term,
 * and the choice here is about certain money now versus certain money later.
 *
 * Yields as at September 2026, when both sat near multi-decade highs.
 * https://tradingeconomics.com/united-kingdom/government-bond-yield
 *
 * Hard-coded for now. Reading them live from a market data feed would keep
 * the comparison honest as rates move; see README.
 */
export const GILT_YIELD_30_YEAR = 0.0575;
export const GILT_YIELD_10_YEAR = 0.052;

/**
 * Above this many years still to run, the 30-year yield is the better match
 * for the length of the decision; below it, the 10-year.
 */
export const LONG_HORIZON_YEARS = 15;

/**
 * The Plan 2 repayment threshold is frozen at £29,385 from April 2027 until
 * April 2030. After that it is expected to rise with average earnings, but
 * that is a policy choice rather than a guarantee — hence a user-editable
 * assumption rather than a constant.
 */
export const THRESHOLD_FREEZE_UNTIL_YEAR = 2030;

/** A reasonable long-run default for threshold uprating once the freeze ends. */
export const DEFAULT_THRESHOLD_GROWTH = 0.03;

/** Default real (above-inflation) pay growth, and how long it is assumed to last. */
export const DEFAULT_REAL_SALARY_GROWTH = 0.02;
export const DEFAULT_REAL_GROWTH_YEARS = 10;

/** Student loan interest is added daily by the Student Loans Company. */
export const DAYS_PER_YEAR = 365;
