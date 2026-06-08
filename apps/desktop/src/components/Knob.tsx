import { RotaryKnob } from "./RotaryKnob";

type KnobProps = {
  label: string;
  value: number;
  min?: number;
  max?: number;
  unit?: string;
  size?: "sm" | "md";
  title?: string;
  onChange: (value: number) => void;
};

export function Knob({
  label,
  value,
  min = -24,
  max = 24,
  unit = "dB",
  size = "sm",
  title,
  onChange,
}: KnobProps) {
  return (
    <RotaryKnob
      label={label}
      value={value}
      min={min}
      max={max}
      unit={unit}
      size={size}
      title={title}
      onChange={onChange}
    />
  );
}
