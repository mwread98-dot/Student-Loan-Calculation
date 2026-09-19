import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatMoney } from '../domain/analysis';
import type { Comparison } from '../domain/types';

interface Row {
  year: number;
  minimum: number;
  overpaid: number;
}

/**
 * Balance over time under both scenarios, sampled yearly plus the final month.
 * A 30-year projection is 360 monthly points, which is more resolution than the
 * eye can use and makes the shape harder to read.
 *
 * A scenario that finishes early is plotted at zero rather than left blank, so
 * a cleared loan reads as a line hitting the floor instead of one that stops
 * for no visible reason.
 */
function toRows(comparison: Comparison): Row[] {
  const { minimumOnly, withOverpayment } = comparison;
  const length = Math.max(minimumOnly.months.length, withOverpayment.months.length);
  if (length === 0) return [];

  const indices: number[] = [];
  for (let i = 0; i < length; i += 12) indices.push(i);
  if (indices[indices.length - 1] !== length - 1) indices.push(length - 1);

  return indices.map((i) => {
    const min = minimumOnly.months[i];
    const over = withOverpayment.months[i];
    const date = (min ?? over)!.date;
    return {
      year: Number(date.slice(0, 4)),
      minimum: min ? total(min.balances) : 0,
      overpaid: over ? total(over.balances) : 0,
    };
  });
}

function total(balances: Record<string, number>): number {
  return Object.values(balances).reduce((sum, value) => sum + value, 0);
}

export function BalanceChart({ comparison }: { comparison: Comparison }) {
  const rows = toRows(comparison);
  const candidate = firstWriteOffYear(comparison);
  // A reference line on a category axis only renders if it matches a tick.
  const writeOffYear =
    candidate !== null && rows.some((row) => row.year === candidate) ? candidate : null;

  return (
    <div className="card">
      <h2>What you still owe, year by year</h2>
      <div className="chart-wrap">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 6, right: 8, left: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              dataKey="year"
              stroke="var(--text-muted)"
              fontSize={12}
              tickMargin={6}
            />
            <YAxis
              stroke="var(--text-muted)"
              fontSize={12}
              width={64}
              tickFormatter={(value: number) =>
                value >= 1000 ? `£${Math.round(value / 1000)}k` : `£${value}`
              }
            />
            <Tooltip
              contentStyle={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                color: 'var(--text)',
                fontSize: 13,
              }}
              formatter={(value: number) => formatMoney(value)}
              labelFormatter={(year: number) => `April ${year}`}
            />
            <Legend wrapperStyle={{ fontSize: 13 }} />
            {writeOffYear !== null && (
              <ReferenceLine
                x={writeOffYear}
                stroke="var(--text-muted)"
                strokeDasharray="4 4"
                label={{
                  value: 'written off',
                  position: 'insideTopRight',
                  fill: 'var(--text-muted)',
                  fontSize: 11,
                }}
              />
            )}
            <Line
              type="monotone"
              dataKey="minimum"
              name="Minimum repayments"
              stroke="var(--hold)"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="overpaid"
              name="With overpayment"
              stroke="var(--good)"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="chart-note">
        A balance that keeps climbing is normal on Plan 2: if your repayments do not
        cover the interest, the debt grows until the day it is cancelled. What matters
        is the total you hand over, not the size of the balance.
      </p>
    </div>
  );
}

function firstWriteOffYear(comparison: Comparison): number | null {
  const dates = comparison.minimumOnly.perLoan
    .map((loan) => loan.writeOffDate)
    .filter((date): date is string => date !== null);
  if (dates.length === 0) return null;
  const earliest = dates.sort()[0];
  return earliest ? Number(earliest.slice(0, 4)) : null;
}
