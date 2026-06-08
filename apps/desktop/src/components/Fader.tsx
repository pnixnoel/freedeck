import { VerticalFader } from "./VerticalFader";

type FaderProps = {
  label: string;
  value: number;
  min?: number;
  max?: number;
  height?: string;
  heightPx?: number;
  variant?: "default" | "mixer";
  onChange: (value: number) => void;
};

export function Fader({
  label,
  value,
  min = 0,
  max = 1,
  height = "h-24",
  heightPx,
  variant = "default",
  onChange,
}: FaderProps) {
  return (
    <VerticalFader
      label={label}
      value={value}
      min={min}
      max={max}
      height={height}
      heightPx={heightPx}
      variant={variant}
      onChange={onChange}
    />
  );
}
