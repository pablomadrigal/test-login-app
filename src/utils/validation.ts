export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

export function isHex(hex: string): boolean {
  return /^0x[0-9a-f]*$/i.test(hex);
}

export function assertRange(data: unknown, type: string, { min, max }: { min: bigint; max: bigint }) {
  const value = BigInt(data as string);
  assert(value >= min && value <= max, `${value} (${type}) is out of bounds [${min}, ${max}]`);
}

export default function assert(condition: boolean, message?: string): asserts condition {
  if (!condition) {
    throw new Error(message || 'Assertion failure');
  }
} 