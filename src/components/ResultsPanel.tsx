import {
  formatDuration,
  formatMoney,
  formatMonth,
  formatPercent,
  planLabel,
} from '../domain/analysis';
import type { Comparison } from '../domain/types';

export function ResultsPanel({ comparison }: { comparison: Comparison }) {
  const {
    minimumOnly,
    withOverpayment,
    presentValueSaving,
    nominalDifference,
    overpaymentCommitted,
    monthsSaved,
    breakEvenRate,
  } = comparison;

  const saves = presentValueSaving > 0;

  return (
    <>
      <div className="stat-grid">
        <div className="stat">
          <div className="label">Better off by</div>
          <div className={`value ${saves ? 'good' : 'bad'}`}>
            {formatMoney(Math.abs(presentValueSaving))}
          </div>
          <div className="sub">
            in today's money, {saves ? 'if you overpay' : 'if you keep your cash'}
          </div>
        </div>
        <div className="stat">
          <div className="label">Cash difference</div>
          <div className="value">
            {nominalDifference >= 0 ? '+' : '−'}
            {formatMoney(Math.abs(nominalDifference))}
          </div>
          <div className="sub">
            {nominalDifference >= 0 ? 'more' : 'less'} handed over in total
          </div>
        </div>
        <div className="stat">
          <div className="label">Debt-free sooner by</div>
          <div className="value">{monthsSaved > 0 ? formatDuration(monthsSaved) : '—'}</div>
          <div className="sub">
            {monthsSaved > 0 ? 'of repayments avoided' : 'no change to the end date'}
          </div>
        </div>
        <div className="stat">
          <div className="label">Break-even return</div>
          <div className="value">
            {breakEvenRate === null ? '—' : formatPercent(breakEvenRate)}
          </div>
          <div className="sub">
            {breakEvenRate === null
              ? 'overpaying never wins here'
              : `vs ${formatPercent(comparison.discountRate.rate)} risk-free`}
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Side by side</h2>
        <table className="compare">
          <thead>
            <tr>
              <th scope="col">&nbsp;</th>
              <th scope="col">Minimum only</th>
              <th scope="col">With overpayment</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Total you hand over</td>
              <td className="emphasis">{formatMoney(minimumOnly.totalPaid)}</td>
              <td className="emphasis">{formatMoney(withOverpayment.totalPaid)}</td>
            </tr>
            <tr>
              <td>…of which voluntary</td>
              <td>{formatMoney(0)}</td>
              <td>{formatMoney(overpaymentCommitted)}</td>
            </tr>
            <tr>
              <td>Interest charged</td>
              <td>{formatMoney(minimumOnly.totalInterest)}</td>
              <td>{formatMoney(withOverpayment.totalInterest)}</td>
            </tr>
            <tr>
              <td>Written off, never repaid</td>
              <td>{formatMoney(minimumOnly.writtenOff)}</td>
              <td>{formatMoney(withOverpayment.writtenOff)}</td>
            </tr>
            <tr>
              <td>Last payment</td>
              <td>
                {minimumOnly.finalPaymentDate
                  ? formatMonth(minimumOnly.finalPaymentDate)
                  : 'none'}
              </td>
              <td>
                {withOverpayment.finalPaymentDate
                  ? formatMonth(withOverpayment.finalPaymentDate)
                  : 'none'}
              </td>
            </tr>
            <tr>
              <td>Cost in today's money</td>
              <td className="emphasis">{formatMoney(minimumOnly.presentValue)}</td>
              <td className="emphasis">{formatMoney(withOverpayment.presentValue)}</td>
            </tr>
          </tbody>
        </table>

        <p className="rates-note">
          Future payments are discounted at{' '}
          <strong>{formatPercent(comparison.discountRate.rate)}</strong> —{' '}
          {comparison.discountRate.label}
          {comparison.discountRate.basis === 'override'
            ? '.'
            : `, chosen because the debt has about ${Math.round(comparison.discountRate.horizonYears)} years left to run.`}{' '}
          That is the return you could get for certain instead of overpaying, so
          it is the bar overpaying has to clear.
        </p>

        {minimumOnly.perLoan.length > 1 && (
          <>
            <h3>What happens to each loan on minimum repayments</h3>
            <table className="compare">
              <thead>
                <tr>
                  <th scope="col">Loan</th>
                  <th scope="col">You repay</th>
                  <th scope="col">Written off</th>
                  <th scope="col">Ends</th>
                </tr>
              </thead>
              <tbody>
                {minimumOnly.perLoan.map((loan) => (
                  <tr key={loan.plan}>
                    <td>{planLabel(loan.plan)}</td>
                    <td>{formatMoney(loan.totalPaid)}</td>
                    <td>{formatMoney(loan.writtenOff)}</td>
                    <td>
                      {loan.clearedDate
                        ? formatMonth(loan.clearedDate)
                        : loan.writeOffDate
                          ? `${formatMonth(loan.writeOffDate)} (write-off)`
                          : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </>
  );
}
