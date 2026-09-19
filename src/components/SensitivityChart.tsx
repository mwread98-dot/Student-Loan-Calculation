import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatMoney, salarySensitivity } from '../domain/analysis';
import type { Assumptions, Loan, OverpaymentPlan } from '../domain/types';

const GROWTH_RATES = [0, 0.005, 0.01, 0.015, 0.02, 0.03, 0.04, 0.05];

interface Props {
  loans: Loan[];
  assumptions: Assumptions;
  overpayment: OverpaymentPlan;
}

/**
 * How the answer moves with career trajectory. Pay rises drive whether the loan
 * is ever cleared, so the verdict is far more sensitive to this one assumption
 * than to anything else on the form — worth showing rather than burying.
 */
export function SensitivityChart({ loans, assumptions, overpayment }: Props) {
  const rows = salarySensitivity(loans, assumptions, overpayment, GROWTH_RATES).map(
    (row) => ({
      label: `${(row.growth * 100).toFixed(row.growth * 100 % 1 === 0 ? 0 : 1)}%`,
      saving: row.presentValueSaving,
      writtenOff: row.writtenOff,
    }),
  );

  // Savings can range from a few hundred pounds to tens of thousands, so the
  // axis switches units rather than rounding every small value down to "£0k".
  const peak = Math.max(...rows.map((row) => Math.abs(row.saving)), 0);
  const formatTick = (value: number) => {
    const sign = value < 0 ? '−' : '';
    const magnitude = Math.abs(value);
    if (peak < 2_000) return `${sign}£${Math.round(magnitude)}`;
    // Ticks do not always land on whole thousands; rounding them to one would
    // label a £4,500 gridline "£5k" and put it next to another reading "£3k".
    const thousands = magnitude / 1000;
    const text =
      Number.isInteger(thousands) ? thousands.toFixed(0) : thousands.toFixed(1);
    return `${sign}£${text}k`;
  };

  const anyPositive = rows.some((row) => row.saving > 0);
  const anyNegative = rows.some((row) => row.saving < 0);
  const flips = anyPositive && anyNegative;

  return (
    <div className="card">
      <h2>How much does the answer depend on your career?</h2>
      <div className="chart-wrap">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 6, right: 8, left: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              dataKey="label"
              stroke="var(--text-muted)"
              fontSize={12}
              tickMargin={6}
              label={{
                value: 'Pay growth above inflation, each year',
                position: 'insideBottom',
                offset: -2,
                fill: 'var(--text-muted)',
                fontSize: 11,
              }}
            />
            <YAxis
              stroke="var(--text-muted)"
              fontSize={12}
              width={64}
              tickFormatter={formatTick}
            />
            <Tooltip
              contentStyle={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                color: 'var(--text)',
                fontSize: 13,
              }}
              formatter={(value: number) => [
                `${value >= 0 ? 'Better off' : 'Worse off'} by ${formatMoney(Math.abs(value))}`,
                'Overpaying',
              ]}
              labelFormatter={(label: string) => `${label} a year above inflation`}
            />
            <ReferenceLine y={0} stroke="var(--text-muted)" />
            <Bar dataKey="saving" radius={[3, 3, 0, 0]} isAnimationActive={false}>
              {rows.map((row) => (
                <Cell
                  key={row.label}
                  fill={row.saving >= 0 ? 'var(--good)' : 'var(--hold)'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="chart-note">
        {flips
          ? 'The answer flips depending on how your career goes. Bars above the line are salary paths where overpaying pays off; bars below are paths where you should keep the money. If your own estimate sits near the crossover, treat the recommendation as weak.'
          : anyPositive
            ? 'Overpaying comes out ahead across every salary path shown, so the recommendation does not hinge on guessing your pay rises correctly.'
            : 'Keeping your money comes out ahead across every salary path shown, so the recommendation does not hinge on guessing your pay rises correctly.'}
      </p>
    </div>
  );
}
