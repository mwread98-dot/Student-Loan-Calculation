import type { TaxBands } from './types';

/**
 * UK income tax as it applies to savings interest.
 *
 * Interest is not taxed in isolation: it stacks on top of employment income,
 * and three separate nil-rate bands may apply before any tax is due. Getting
 * this wrong by assuming a flat marginal rate materially misstates the return
 * on money kept rather than handed to the Student Loans Company, which is the
 * whole comparison this calculator makes.
 *
 * Covers England, Wales and Northern Ireland. Scottish taxpayers pay Scottish
 * rates on employment income but UK rates on savings income, so the interest
 * figures here still hold; the band their salary lands them in may not.
 */

/** The personal allowance, withdrawn by £1 for every £2 of income over £100,000. */
export function personalAllowance(totalIncome: number, bands: TaxBands): number {
  const excess = Math.max(0, totalIncome - bands.personalAllowanceTaperFrom);
  return Math.max(0, bands.personalAllowance - excess / 2);
}

/**
 * The personal savings allowance, which depends on the band the taxpayer's
 * total income puts them in — and disappears entirely at the additional rate.
 */
export function personalSavingsAllowance(
  totalIncome: number,
  bands: TaxBands,
): number {
  if (totalIncome > bands.additionalRateThreshold) return bands.psaAdditional;
  if (totalIncome > bands.higherRateThreshold) return bands.psaHigher;
  return bands.psaBasic;
}

/**
 * Income tax due on savings interest earned on top of employment income.
 *
 * The order matters and is HMRC's: the personal allowance covers employment
 * income first, then any left over covers interest; the £5,000 starting rate
 * for savings is eroded pound for pound by employment income above the
 * allowance; the personal savings allowance comes next. Both nil-rate bands
 * still occupy room in the basic rate band even though they cost nothing,
 * which is why they cannot simply be subtracted at the end.
 */
export function taxOnSavingsInterest(
  savingsInterest: number,
  employmentIncome: number,
  bands: TaxBands,
): number {
  if (savingsInterest <= 0) return 0;

  const totalIncome = employmentIncome + savingsInterest;
  const allowance = personalAllowance(totalIncome, bands);

  const allowanceUsedByPay = Math.min(employmentIncome, allowance);
  const allowanceLeftForSavings = allowance - allowanceUsedByPay;
  const taxablePay = employmentIncome - allowanceUsedByPay;

  // The starting rate band shrinks pound for pound as taxable pay grows, and
  // is gone entirely once pay exceeds the allowance by £5,000.
  const startingRateBand = Math.max(0, bands.startingRateForSavings - taxablePay);
  const psa = personalSavingsAllowance(totalIncome, bands);

  let remaining = Math.max(0, savingsInterest - allowanceLeftForSavings);
  // Where this income sits in the taxable stack, employment income first.
  let position = taxablePay;
  let tax = 0;

  // Nil-rate bands: no tax, but they do use up basic rate room.
  const nilRate = Math.min(remaining, startingRateBand + psa);
  position += nilRate;
  remaining -= nilRate;

  const basicRoom = Math.max(0, bands.basicRateLimit - position);
  const inBasic = Math.min(remaining, basicRoom);
  tax += inBasic * bands.basicRate;
  position += inBasic;
  remaining -= inBasic;

  // Expressed as taxable income, the additional rate starts where the
  // threshold sits less whatever allowance survives the taper.
  const higherRoom = Math.max(
    0,
    bands.additionalRateThreshold - allowance - position,
  );
  const inHigher = Math.min(remaining, higherRoom);
  tax += inHigher * bands.higherRate;
  remaining -= inHigher;

  tax += remaining * bands.additionalRate;
  return tax;
}

/**
 * The return actually kept after tax, on a given sum at a given gross rate.
 *
 * Inside an ISA the gross rate is the net rate. Outside one it depends on how
 * much interest the money throws off and where that lands on top of the
 * borrower's salary — so it is a property of the amount, not just the rate.
 */
export function netReturnRate(
  grossRate: number,
  principal: number,
  employmentIncome: number,
  bands: TaxBands,
  taxFree: boolean,
): number {
  if (taxFree || principal <= 0) return grossRate;
  const grossInterest = principal * grossRate;
  const tax = taxOnSavingsInterest(grossInterest, employmentIncome, bands);
  return (grossInterest - tax) / principal;
}

/**
 * Tax thresholds uprated to a given tax year. Frozen thresholds with rising
 * pay drag people into higher bands without any rate ever changing, which is
 * why the freeze end year is an input rather than a constant.
 */
export function bandsForTaxYear(
  base: TaxBands,
  taxYear: number,
  baseTaxYear: number,
  freezeUntilYear: number,
  growth: number,
): TaxBands {
  const firstGrowingYear = Math.max(baseTaxYear + 1, freezeUntilYear);
  const years = Math.max(0, taxYear - firstGrowingYear + 1);
  if (years === 0) return base;

  const factor = Math.pow(1 + growth, years);
  return {
    ...base,
    personalAllowance: base.personalAllowance * factor,
    personalAllowanceTaperFrom: base.personalAllowanceTaperFrom * factor,
    basicRateLimit: base.basicRateLimit * factor,
    higherRateThreshold: base.higherRateThreshold * factor,
    additionalRateThreshold: base.additionalRateThreshold * factor,
    startingRateForSavings: base.startingRateForSavings * factor,
    psaBasic: base.psaBasic * factor,
    psaHigher: base.psaHigher * factor,
  };
}
