import { useMemo, useState } from 'react';
import { InputPanel, type LoanEntry } from './components/InputPanel';
import { VerdictCard } from './components/VerdictCard';
import { ResultsPanel } from './components/ResultsPanel';
import { BalanceChart } from './components/BalanceChart';
import { SensitivityChart } from './components/SensitivityChart';
import { compare } from './domain/analysis';
import {
  DEFAULT_REAL_GROWTH_YEARS,
  DEFAULT_REAL_SALARY_GROWTH,
  DEFAULT_THRESHOLD_GROWTH,
  INTEREST_CAP,
  INTEREST_CAP_UNTIL_YEAR,
  RATES_LAST_CHECKED,
  RATES_TAX_YEAR,
  RPI_FORECAST,
  RPI_LONG_RUN,
  RPI_REVERSION_YEARS,
  TAX_BANDS_2026_27,
  TAX_THRESHOLD_FREEZE_UNTIL_YEAR,
  DEFAULT_TAX_THRESHOLD_GROWTH,
  THRESHOLD_FREEZE_UNTIL_YEAR,
} from './domain/rates';
import type { Assumptions, Loan, OverpaymentPlan } from './domain/types';

export default function App() {
  const [plan2, setPlan2] = useState<LoanEntry>({
    enabled: true,
    balance: 45_000,
    firstRepaymentDueYear: 2019,
  });
  const [postgrad, setPostgrad] = useState<LoanEntry>({
    enabled: false,
    balance: 12_000,
    firstRepaymentDueYear: 2021,
  });
  const [assumptions, setAssumptions] = useState<Assumptions>({
    grossAnnualSalary: 42_000,
    realSalaryGrowth: DEFAULT_REAL_SALARY_GROWTH,
    realGrowthYears: DEFAULT_REAL_GROWTH_YEARS,
    rpiForecast: RPI_FORECAST,
    rpiLongRun: RPI_LONG_RUN,
    rpiReversionYears: RPI_REVERSION_YEARS,
    interestCap: INTEREST_CAP,
    interestCapUntilYear: INTEREST_CAP_UNTIL_YEAR,
    thresholdGrowth: DEFAULT_THRESHOLD_GROWTH,
    thresholdFreezeUntilYear: THRESHOLD_FREEZE_UNTIL_YEAR,
    opportunityRateOverride: null,
    isaAvailable: true,
    taxBands: TAX_BANDS_2026_27,
    taxThresholdFreezeUntilYear: TAX_THRESHOLD_FREEZE_UNTIL_YEAR,
    taxThresholdGrowth: DEFAULT_TAX_THRESHOLD_GROWTH,
    startDate: startOfThisMonth(),
  });
  const [overpayment, setOverpayment] = useState<OverpaymentPlan>({
    lumpSum: 5_000,
    monthly: 0,
    target: 'auto',
  });

  const loans = useMemo<Loan[]>(() => {
    const list: Loan[] = [];
    if (plan2.enabled && plan2.balance > 0) {
      list.push({
        plan: 'plan2',
        balance: plan2.balance,
        firstRepaymentDueYear: plan2.firstRepaymentDueYear,
      });
    }
    if (postgrad.enabled && postgrad.balance > 0) {
      list.push({
        plan: 'postgrad',
        balance: postgrad.balance,
        firstRepaymentDueYear: postgrad.firstRepaymentDueYear,
      });
    }
    return list;
  }, [plan2, postgrad]);

  const comparison = useMemo(
    () => (loans.length > 0 ? compare(loans, assumptions, overpayment) : null),
    [loans, assumptions, overpayment],
  );

  return (
    <div className="page">
      <header className="masthead">
        <h1>Should you overpay your student loan?</h1>
        <p>
          For UK Plan 2 and Postgraduate loans. Most people are told to clear debt
          early. Student loans are the exception: they are written off after 30 years,
          so overpaying a loan you were never going to finish repaying is money
          thrown away. This works out which case you are in.
        </p>
      </header>

      <div className="layout">
        <InputPanel
          plan2={plan2}
          postgrad={postgrad}
          assumptions={assumptions}
          overpayment={overpayment}
          onPlan2Change={setPlan2}
          onPostgradChange={setPostgrad}
          onAssumptionsChange={setAssumptions}
          onOverpaymentChange={setOverpayment}
        />

        <main>
          {comparison === null ? (
            <div className="card">
              <div className="empty-state">
                Tick a loan and enter a balance to see whether overpaying is worth it.
              </div>
            </div>
          ) : (
            <>
              <VerdictCard verdict={comparison.verdict} />
              <ResultsPanel comparison={comparison} />
              <BalanceChart comparison={comparison} />
              <SensitivityChart
                loans={loans}
                assumptions={assumptions}
                overpayment={overpayment}
              />
            </>
          )}

          <div className="disclaimer">
            <h3>What this does and does not do</h3>
            <p>
              Everything is worked out in your browser. No salary, balance or any other
              figure you type is sent anywhere or stored.
            </p>
            <p>
              The two options are compared in present-value terms. Future payments are
              discounted at the yield on UK government bonds matched to how long your
              debt has left to run — the closest thing to a certain return over that
              term, and the fair way to weigh a pound paid today against a pound paid in
              twenty years' time. Yields are as at {RATES_LAST_CHECKED} and are not
              updated automatically.
            </p>
            <p>
              Inflation follows the Office for Budget Responsibility's published
              forecast to 2029, then settles at {(RPI_LONG_RUN * 100).toFixed(1)}%.
              That long-run figure is low on purpose: from February 2030 RPI is
              calculated as CPIH, which has run roughly a percentage point below the
              old RPI. Since that covers most of a 30-year term, it moves the answer
              more than any near-term forecast does.
            </p>
            <p>
              A projection this long is only as good as its assumptions. Pay rises,
              RPI and government policy will all differ from any forecast, and the
              repayment thresholds themselves are set year by year. Treat the answer as
              a way of seeing which factors actually drive the decision, not as a
              prediction. This is not financial advice; for a decision this size,
              speak to a qualified adviser.
            </p>
            <p>
              Statutory figures are for the {RATES_TAX_YEAR} tax year, last checked{' '}
              {RATES_LAST_CHECKED}. Check the current rates at{' '}
              <a
                href="https://www.gov.uk/repaying-your-student-loan/what-you-pay"
                target="_blank"
                rel="noreferrer noopener"
              >
                gov.uk
              </a>
              , and your own balance on your{' '}
              <a
                href="https://www.gov.uk/sign-in-to-manage-your-student-loan-balance"
                target="_blank"
                rel="noreferrer noopener"
              >
                Student Loans Company account
              </a>
              .
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}

function startOfThisMonth(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}
