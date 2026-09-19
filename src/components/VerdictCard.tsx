import type { Verdict } from '../domain/types';

const EYEBROW: Record<Verdict['code'], string> = {
  overpay: 'Overpay',
  'do-not-overpay': 'Keep your money',
  marginal: 'Too close to call',
};

export function VerdictCard({ verdict }: { verdict: Verdict }) {
  return (
    <section className={`verdict ${verdict.code}`} aria-live="polite">
      <p className="eyebrow">{EYEBROW[verdict.code]}</p>
      <h2>{verdict.headline}</h2>
      <ul>
        {verdict.reasoning.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </section>
  );
}
