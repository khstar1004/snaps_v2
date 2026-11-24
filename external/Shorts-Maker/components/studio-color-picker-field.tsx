"use client";

type ParsedColor = {
  r: number;
  g: number;
  b: number;
  a: number;
};

type StudioColorPickerFieldProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  inputClassName?: string;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function toHexPair(value: number): string {
  return clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0");
}

function toHexColor(color: ParsedColor): string {
  return `#${toHexPair(color.r)}${toHexPair(color.g)}${toHexPair(color.b)}`;
}

function toAlphaString(alpha: number): string {
  const rounded = Math.round(clamp(alpha, 0, 1) * 100) / 100;
  const normalized = rounded.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  return normalized || "0";
}

function toRgbaColor(color: ParsedColor, alpha: number): string {
  return `rgba(${Math.round(color.r)},${Math.round(color.g)},${Math.round(color.b)},${toAlphaString(alpha)})`;
}

function parseHexColor(value: string): ParsedColor | null {
  const raw = value.trim();
  const match = raw.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/);
  if (!match) return null;
  const payload = match[1];

  if (payload.length === 3 || payload.length === 4) {
    const r = Number.parseInt(`${payload[0]}${payload[0]}`, 16);
    const g = Number.parseInt(`${payload[1]}${payload[1]}`, 16);
    const b = Number.parseInt(`${payload[2]}${payload[2]}`, 16);
    const a = payload.length === 4 ? Number.parseInt(`${payload[3]}${payload[3]}`, 16) / 255 : 1;
    return { r, g, b, a };
  }

  const r = Number.parseInt(payload.slice(0, 2), 16);
  const g = Number.parseInt(payload.slice(2, 4), 16);
  const b = Number.parseInt(payload.slice(4, 6), 16);
  const a = payload.length === 8 ? Number.parseInt(payload.slice(6, 8), 16) / 255 : 1;
  return { r, g, b, a };
}

function parseRgbColor(value: string): ParsedColor | null {
  const match = value.trim().match(/^rgba?\(([^)]+)\)$/i);
  if (!match) return null;
  const parts = match[1].split(",").map((item) => item.trim());
  if (parts.length !== 3 && parts.length !== 4) return null;

  const r = Number(parts[0]);
  const g = Number(parts[1]);
  const b = Number(parts[2]);
  const a = parts.length === 4 ? Number(parts[3]) : 1;
  if (![r, g, b, a].every((item) => Number.isFinite(item))) return null;

  return {
    r: clamp(r, 0, 255),
    g: clamp(g, 0, 255),
    b: clamp(b, 0, 255),
    a: clamp(a, 0, 1),
  };
}

function parseColor(value: string): ParsedColor | null {
  return parseHexColor(value) || parseRgbColor(value);
}

function formatColorByAlpha(color: ParsedColor, alpha: number): string {
  if (alpha >= 0.999) return toHexColor(color);
  return toRgbaColor(color, alpha);
}

export function StudioColorPickerField({ value, onChange, disabled, inputClassName }: StudioColorPickerFieldProps) {
  const parsed = parseColor(value) || { r: 0, g: 0, b: 0, a: 1 };
  const alphaPercent = Math.round(clamp(parsed.a, 0, 1) * 100);
  const resolvedInputClassName = inputClassName ? `input-field ${inputClassName}` : "input-field";

  return (
    <div className="studio-color-picker-field">
      <input
        className="studio-template-static-color-input"
        type="color"
        value={toHexColor(parsed)}
        onChange={(event) => {
          const next = parseHexColor(event.target.value);
          if (!next) return;
          onChange(formatColorByAlpha(next, parsed.a));
        }}
        disabled={disabled}
      />
      <input
        className={resolvedInputClassName}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
      />
      <div className="studio-color-picker-alpha-group">
        <span className="studio-color-picker-alpha-label">A</span>
        <input
          className="studio-color-picker-alpha-slider"
          type="range"
          min={0}
          max={100}
          step={1}
          value={alphaPercent}
          onChange={(event) => {
            const nextPercent = clamp(Number(event.target.value) || 0, 0, 100);
            onChange(formatColorByAlpha(parsed, nextPercent / 100));
          }}
          disabled={disabled}
        />
        <input
          className="input-field studio-color-picker-alpha-number"
          type="number"
          min={0}
          max={100}
          step={1}
          value={alphaPercent}
          onChange={(event) => {
            const nextPercent = clamp(Number(event.target.value) || 0, 0, 100);
            onChange(formatColorByAlpha(parsed, nextPercent / 100));
          }}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
