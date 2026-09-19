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
  /**
   * Pay growth *above inflation*. Nominal growth is this compounded with the
   * inflation of the year in question, so a 2% figure means 2% better off in
   * real terms each year, whatever inflation does.
   */
  realSalaryGrowth: number;
  /**
   * How many years the above-inflation growth lasts. After it, pay is assumed
   * to track inflation and no more — which is what most careers actually do
   * once they plateau, and assuming otherwise flatters the case for overpaying.
   */
  realGrowthYears: number;
  /** RPI by tax year, for the years it has been forecast. */
  rpiForecast: { taxYear: number; rate: number }[];
  /** Where RPI settles once the forecast runs out. */
  rpiLongRun: number;
  /** Years taken to travel from the last forecast value to the anchor. */
  rpiReversionYears: number;
  /** Cap on the loan interest rate, or null for uncapped. */
  interestCap: number | null;
  /** The September from which the cap is assumed no longer to apply. */
  interestCapUntilYear: number;
  /** Annual uprating of repayment thresholds once any freeze ends. */
  thresholdGrowth: number;
  /** Thresholds are held flat for tax years before this one. */
  thresholdFreezeUntilYear: number;
  /**
   * What the money would earn instead, used as the discount rate. Left null,
   * it is taken from the gilt yield matching how long the debt has left to
   * run, which is the closest thing to a risk-free return over that term.
   */
  opportunityRateOverride: number | null;
  /**
   * Whether the money kept back could sit in an ISA, where interest is free of
   * tax. If not, the return is taxed according to the borrower's salary.
   */
  isaAvailable: boolean;
  /** Income tax thresholds and rates as they stand today. */
  taxBands: TaxBands;
  /** Tax thresholds are held flat for tax years before this one. */
  taxThresholdFreezeUntilYear: number;
  /** Annual uprating of tax thresholds once the freeze ends. */
  taxThresholdGrowth: number;
  /** Month the projection starts from. Defaults to today. */
  startDate: Date;
}

/** Income tax thresholds and rates, for a single tax year. */
export interface TaxBands {
  personalAllowance: number;
  /** Income above which the personal allowance is withdrawn. */
  personalAllowanceTaperFrom: number;
  /** Taxable income covered by the basic rate, above the personal allowance. */
  basicRateLimit: number;
  higherRateThreshold: number;
  additionalRateThreshold: number;
  basicRate: number;
  higherRate: number;
  additionalRate: number;
  /** Savings income taxed at 0%, eroded by employment income. */
  startingRateForSavings: number;
  psaBasic: number;
  psaHigher: number;
  psaAdditional: number;
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
  /** RPI in force this month. */
  rpi: number;
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

/** Where the discount rate came from, so the figure can be justified. */
export interface DiscountRate {
  /** The rate used, after tax. */
  rate: number;
  /** The rate before tax, for showing what tax costs. */
  grossRate: number;
  basis: 'gilt-30' | 'gilt-10' | 'override';
  /** Years the debt still has to run, which decided the choice of gilt. */
  horizonYears: number;
  /** Whether the return was treated as tax free. */
  taxFree: boolean;
  /**
   * Share of the gross return lost to tax, averaged over the term. Zero inside
   * an ISA, and non-zero outside one even for a basic rate taxpayer once the
   * savings allowance is used up.
   */
  effectiveTaxRate: number;
  label: string;
}

export interface Comparison {
  /** The rate used to discount both scenarios, and why. */
  discountRate: DiscountRate;
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
