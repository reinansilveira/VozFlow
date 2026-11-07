import type { ReactElement } from 'react';

type SwitchProps = {
  checked: boolean;
  label: string;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
};

export const Switch = ({ checked, label, disabled = false, onChange }: SwitchProps): ReactElement => <button
  type="button"
  role="switch"
  aria-checked={checked}
  aria-label={label}
  title={label}
  disabled={disabled}
  className={`switch ${checked ? 'switch--on' : ''}`}
  onClick={() => onChange(!checked)}
>
  <span className="switch__thumb" aria-hidden="true" />
</button>;
