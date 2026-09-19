export type LoanPlanId = 'plan2' | 'postgrad';

/** One outstanding loan the borrower holds. */
export interface Loan {
  plan: LoanPlanId;
  /** Outstanding balance today, in pounds. */
  balance: number;
  /**
   * Calendar year of the April in which repayments first became due — the April
   * after leaving the course. Drives the 30-year write-off date.
   */
  firstRepaymentDueYear: number;
}

/** Everything the projection has to assume rather than know. */
export interface Assumptions {
  /** Gross annual salary today, before tax. */
  grossAnnualSalary: number;
  /** Nominal annual salary growth, e.g. 0.04 for 4%. */
  salaryGrowth: number;
  /** RPI used for loan interest. */
  rpi: number;
  /** Cap on the loan interest rate, or null for uncapped. */
  interestCap: number | null;
  /** Annual uprating of repayment thresholds once any freeze ends. */
  thresholdGrowth: number;
  /** Thresholds are held flat for tax years before this one. */
  thresholdFreezeUntilYear: number;
  /**
   * What the money would earn instead, net of tax — a savings rate, an expected
   * investment return, or a mortgage rate. This is the discount rate used to
   * compare the two scenarios, so it is the single most important input after
   * salary.
   */
  opportunityRate: number;
  /** Month the projection starts from. Defaults to today. */
  startDate: Date;
}

/** A voluntary overpayment the borrower is considering. */
export interface OverpaymentPlan {
  /** One-off payment made immediately. */
  lumpSum: number;
  /** Extra paid every month on top of the mandatory deduction. */
  monthly: number;
  /**
   * Which loan to put voluntary payments against. 'auto' always targets
   * whichever loan is currently charging the higher interest rate, which is the
   * cheapest strategy.
   */
  target: 'auto' | LoanPlanId;
}

/** One month of the projection. */
export interface MonthSnapshot {
  /** Months since the projection started. */
  index: number;
  date: string;
  grossAnnualSalary: number;
  /** Closing balance per loan after interest and payments. */
  balances: Record<LoanPlanId, number>;
  interestAccrued: number;
  mandatoryPaid: number;
  voluntaryPaid: number;
  /** Balance cancelled by write-off this month, if any. */
  writtenOff: number;
}

export interface LoanOutcome {
  plan: LoanPlanId;
  openingBalance: number;
  totalPaid: number;
  totalInterest: number;
  /** ISO month the balance reached zero through payment, or null. */
  clearedDate: string | null;
  /** ISO month the remaining balance was cancelled, or null. */
  writeOffDate: string | null;
  /** Balance cancelled at write-off. */
  writtenOff: number;
}

export interface ScenarioResult {
  months: MonthSnapshot[];
  /** Every pound handed over, undiscounted. */
  totalPaid: number;
  totalInterest: number;
  /** Total paid, discounted to today at the opportunity rate. */
  presentValue: number;
  /** ISO month all loans reached zero through payment, or null if written off. */
  clearedDate: string | null;
  /** Total balance cancelled across all loans. */
  writtenOff: number;
  /** Last month in which any payment was made. */
  finalPaymentDate: string | null;
  perLoan: LoanOutcome[];
}

export type VerdictCode = 'overpay' | 'do-not-overpay' | 'marginal';

export interface Verdict {
  code: VerdictCode;
  headline: string;
  reasoning: string[];
}

export interface Comparison {
  minimumOnly: ScenarioResult;
  withOverpayment: ScenarioResult;
  /** Extra cash you hand over by overpaying. Negative means you pay less overall. */
  nominalDifference: number;
  /** Present-value saving from overpaying. Positive means overpaying wins. */
  presentValueSaving: number;
  /** Total voluntary money committed. */
  overpaymentCommitted: number;
  /** Months of payments avoided. */
  monthsSaved: number;
  /**
   * The opportunity rate at which the two scenarios break even. Earn more than
   * this elsewhere and keeping the cash wins. Null when no crossover exists.
   */
  breakEvenRate: number | null;
  verdict: Verdict;
}
