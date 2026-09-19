interface Props {
  label: string;
  value: number;
  onChange: (value: number) => void;
  hint?: string;
  prefix?: string;
  suffix?: string;
  min?: number;
  max?: number;
  step?: number;
  id: string;
}

/**
 * A labelled numeric input. Empty input is reported as 0 rather than NaN so a
 * half-typed value can never poison the projection.
 */
export function NumberField({
  label,
  value,
  onChange,
  hint,
  prefix,
  suffix,
  min = 0,
  max,
  step = 1,
  id,
}: Props) {
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {hint && <span className="hint">{hint}</span>}
      </label>
      <div className="input-wrap">
        {prefix && <span className="prefix">{prefix}</span>}
        <input
          id={id}
          type="number"
          className={`${prefix ? 'has-prefix' : ''} ${suffix ? 'has-suffix' : ''}`}
          value={Number.isFinite(value) ? value : 0}
          min={min}
          max={max}
          step={step}
          onChange={(event) => {
            const parsed = Number.parseFloat(event.target.value);
            onChange(Number.isFinite(parsed) ? parsed : 0);
          }}
        />
        {suffix && <span className="suffix">{suffix}</span>}
      </div>
    </div>
  );
}
