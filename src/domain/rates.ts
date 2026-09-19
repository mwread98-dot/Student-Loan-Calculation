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
 * RPI used for student loan interest, applied from 1 September each year and
 * fixed for twelve months. Taken from the previous March's RPI figure.
 */
export const CURRENT_RPI = 0.041;

/**
 * The government caps student loan interest so it does not exceed the
 * "prevailing market rate" for comparable unsecured personal loans. For
 * 2026/27 a headline 6% cap was announced for both Plan 2 and Postgraduate
 * loans, running 1 September 2026 to 31 August 2027.
 *
 * Set to `null` to model an uncapped rate.
 */
export const INTEREST_CAP = 0.06;

/**
 * The Plan 2 repayment threshold is frozen at £29,385 from April 2027 until
 * April 2030. After that it is expected to rise with average earnings, but
 * that is a policy choice rather than a guarantee — hence a user-editable
 * assumption rather than a constant.
 */
export const THRESHOLD_FREEZE_UNTIL_YEAR = 2030;

/** A reasonable long-run default for threshold uprating once the freeze ends. */
export const DEFAULT_THRESHOLD_GROWTH = 0.03;

/** Student loan interest is added daily by the Student Loans Company. */
export const DAYS_PER_YEAR = 365;
