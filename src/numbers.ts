import { InputError } from "./errors";

export function reqFinite(name: string, value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new InputError("NOT_FINITE", `${name} must be a finite number.`);
  }
  return value;
}

export function reqPositive(name: string, value: unknown): number {
  const n = reqFinite(name, value);
  if (!(n > 0)) {
    throw new InputError("NOT_POSITIVE", `${name} must be greater than 0.`);
  }
  return n;
}

/** A bare number is a fraction. A string ending in % is divided by 100. */
export function parseFraction(name: string, raw: string): number {
  const text = raw.trim();
  if (text.endsWith("%")) {
    const n = Number(text.slice(0, -1).trim());
    if (!Number.isFinite(n)) {
      throw new InputError("NOT_FINITE", `${name} must be a finite number.`);
    }
    return n / 100;
  }
  const n = Number(text);
  if (!Number.isFinite(n)) {
    throw new InputError("NOT_FINITE", `${name} must be a finite number.`);
  }
  return n;
}
