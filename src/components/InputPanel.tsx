import { NumberField } from './NumberField';
import { PLAN_2, POSTGRADUATE, RATES_TAX_YEAR } from '../domain/rates';
import type { Assumptions, OverpaymentPlan } from '../domain/types';

export interface LoanEntry {
  enabled: boolean;
  balance: number;
  firstRepaymentDueYear: number;
}

interface Props {
  plan2: LoanEntry;
  postgrad: LoanEntry;
  assumptions: Assumptions;
  overpayment: OverpaymentPlan;
  onPlan2Change: (next: LoanEntry) => void;
  onPostgradChange: (next: LoanEntry) => void;
  onAssumptionsChange: (next: Assumptions) => void;
  onOverpaymentChange: (next: OverpaymentPlan) => void;
}

export function InputPanel({
  plan2,
  postgrad,
  assumptions,
  overpayment,
  onPlan2Change,
  onPostgradChange,
  onAssumptionsChange,
  onOverpaymentChange,
}: Props) {
  const bothLoans = plan2.enabled && postgrad.enabled;

  return (
    <div>
      <div className="card">
        <h2>Your loans</h2>

        <label className="toggle-row" htmlFor="has-plan2">
          <input
            id="has-plan2"
            type="checkbox"
            checked={plan2.enabled}
            onChange={(e) => onPlan2Change({ ...plan2, enabled: e.target.checked })}
          />
          <span className="toggle-body">
            <strong>{PLAN_2.label}</strong>
            <span>{PLAN_2.blurb}</span>
          </span>
        </label>

        {plan2.enabled && (
          <>
            <NumberField
              id="plan2-balance"
              label="Balance outstanding"
              hint="The figure on your Student Loans Company account today."
              prefix="£"
              step={100}
              value={plan2.balance}
              onChange={(balance) => onPlan2Change({ ...plan2, balance })}
            />
            <NumberField
              id="plan2-year"
              label="Year you started repaying"
              hint="The April after you left your course. Sets the 30-year write-off date."
              min={1998}
              max={2060}
              value={plan2.firstRepaymentDueYear}
              onChange={(firstRepaymentDueYear) =>
                onPlan2Change({ ...plan2, firstRepaymentDueYear })
              }
            />
          </>
        )}

        <label className="toggle-row" htmlFor="has-postgrad">
          <input
            id="has-postgrad"
            type="checkbox"
            checked={postgrad.enabled}
            onChange={(e) =>
              onPostgradChange({ ...postgrad, enabled: e.target.checked })
            }
          />
          <span className="toggle-body">
            <strong>{POSTGRADUATE.label}</strong>
            <span>{POSTGRADUATE.blurb}</span>
          </span>
        </label>

        {postgrad.enabled && (
          <>
            <NumberField
              id="pg-balance"
              label="Balance outstanding"
              prefix="£"
              step={100}
              value={postgrad.balance}
              onChange={(balance) => onPostgradChange({ ...postgrad, balance })}
            />
            <NumberField
              id="pg-year"
              label="Year you started repaying"
              min={2016}
              max={2060}
              value={postgrad.firstRepaymentDueYear}
              onChange={(firstRepaymentDueYear) =>
                onPostgradChange({ ...postgrad, firstRepaymentDueYear })
              }
            />
          </>
        )}

        {bothLoans && (
          <p className="rates-note">
            You repay both at once: {(PLAN_2.repaymentRate * 100).toFixed(0)}% of
            everything over £{PLAN_2.annualRepaymentThreshold.toLocaleString('en-GB')}{' '}
            <em>and</em> {(POSTGRADUATE.repaymentRate * 100).toFixed(0)}% of everything
            over £{POSTGRADUATE.annualRepaymentThreshold.toLocaleString('en-GB')}.
          </p>
        )}
      </div>

      <div className="card">
        <h2>Your income</h2>
        <NumberField
          id="salary"
          label="Gross annual salary"
          hint="Before tax. Repayments and Plan 2 interest are both worked out from this."
          prefix="£"
          step={1000}
          value={assumptions.grossAnnualSalary}
          onChange={(grossAnnualSalary) =>
            onAssumptionsChange({ ...assumptions, grossAnnualSalary })
          }
        />
        <NumberField
          id="salary-growth"
          label="Expected pay rises"
          hint="Average yearly increase over your career, including inflation. This matters more than any other input."
          suffix="%"
          step={0.5}
          min={-5}
          max={20}
          value={round(assumptions.salaryGrowth * 100)}
          onChange={(pct) =>
            onAssumptionsChange({ ...assumptions, salaryGrowth: pct / 100 })
          }
        />
      </div>

      <div className="card">
        <h2>The overpayment you are weighing up</h2>
        <NumberField
          id="lump-sum"
          label="Lump sum today"
          prefix="£"
          step={500}
          value={overpayment.lumpSum}
          onChange={(lumpSum) => onOverpaymentChange({ ...overpayment, lumpSum })}
        />
        <NumberField
          id="monthly-extra"
          label="Extra every month"
          hint="On top of the deduction that comes out of your pay automatically."
          prefix="£"
          step={25}
          value={overpayment.monthly}
          onChange={(monthly) => onOverpaymentChange({ ...overpayment, monthly })}
        />

        {bothLoans && (
          <div className="field">
            <label htmlFor="target">
              Put overpayments towards
              <span className="hint">
                Automatic always attacks whichever loan is charging more interest.
              </span>
            </label>
            <select
              id="target"
              value={overpayment.target}
              onChange={(e) =>
                onOverpaymentChange({
                  ...overpayment,
                  target: e.target.value as OverpaymentPlan['target'],
                })
              }
            >
              <option value="auto">Whichever costs more (recommended)</option>
              <option value="plan2">{PLAN_2.label}</option>
              <option value="postgrad">{POSTGRADUATE.label}</option>
            </select>
          </div>
        )}

        <NumberField
          id="opportunity"
          label="What your money could earn instead"
          hint="Savings rate after tax, expected investment return, or your mortgage rate. Beat the loan's interest and you are better off keeping the cash."
          suffix="%"
          step={0.25}
          min={0}
          max={30}
          value={round(assumptions.opportunityRate * 100)}
          onChange={(pct) =>
            onAssumptionsChange({ ...assumptions, opportunityRate: pct / 100 })
          }
        />
      </div>

      <div className="card">
        <details className="advanced">
          <summary>Advanced assumptions</summary>

          <NumberField
            id="rpi"
            label="RPI used for interest"
            hint={`Fixed each 1 September. ${RATES_TAX_YEAR} uses the previous March's figure.`}
            suffix="%"
            step={0.1}
            min={0}
            max={25}
            value={round(assumptions.rpi * 100)}
            onChange={(pct) => onAssumptionsChange({ ...assumptions, rpi: pct / 100 })}
          />
          <NumberField
            id="cap"
            label="Interest rate cap"
            hint="The government caps the rate at the prevailing market rate. Set to 0 to model no cap."
            suffix="%"
            step={0.1}
            min={0}
            max={25}
            value={
              assumptions.interestCap === null ? 0 : round(assumptions.interestCap * 100)
            }
            onChange={(pct) =>
              onAssumptionsChange({
                ...assumptions,
                interestCap: pct <= 0 ? null : pct / 100,
              })
            }
          />
          <NumberField
            id="threshold-growth"
            label="Threshold uprating once the freeze ends"
            hint="Repayment thresholds normally track average earnings."
            suffix="%"
            step={0.25}
            min={0}
            max={15}
            value={round(assumptions.thresholdGrowth * 100)}
            onChange={(pct) =>
              onAssumptionsChange({ ...assumptions, thresholdGrowth: pct / 100 })
            }
          />
          <NumberField
            id="freeze-year"
            label="Thresholds frozen until"
            hint="The Plan 2 threshold is frozen until April 2030."
            min={2026}
            max={2060}
            value={assumptions.thresholdFreezeUntilYear}
            onChange={(thresholdFreezeUntilYear) =>
              onAssumptionsChange({ ...assumptions, thresholdFreezeUntilYear })
            }
          />
        </details>
      </div>
    </div>
  );
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
