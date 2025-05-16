import type { BigNumberish } from "starknet";
import { TEXT_TO_FELT_MAX_LEN } from "./constants";

export interface ByteArray {
  data: BigNumberish[];
  pending_word: string;
  pending_word_len: number;
}

export function encodeShortString(str: string): string {
  if (!isASCII(str)) throw new Error(`${str} is not an ASCII string`);
  if (!isShortString(str)) throw new Error(`${str} is too long`);
  return addHexPrefix(str.replace(/./g, (char) => char.charCodeAt(0).toString(16)));
}

export function isASCII(str: string): boolean {
  return /^[\x00-\x7F]*$/.test(str);
}

export function isShortString(str: string): boolean {
  return str.length <= TEXT_TO_FELT_MAX_LEN;
}

export function isDecimalString(str: string): boolean {
  return /^[0-9]*$/i.test(str);
}

export function addHexPrefix(hex: string): string {
  return `0x${removeHexPrefix(hex)}`;
}

export function removeHexPrefix(hex: string): string {
  return hex.replace(/^0x/i, '');
}

export function toHex(value: BigNumberish): string {
  return addHexPrefix(toBigInt(value).toString(16));
}

export function toBigInt(value: BigNumberish): bigint {
  return BigInt(value);
}

export function utf8ToArray(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

export function byteArrayFromString(targetString: string): ByteArray {
  const shortStrings: string[] = splitLongString(targetString);
  const remainder: string = shortStrings[shortStrings.length - 1];
  const shortStringsEncoded: BigNumberish[] = shortStrings.map(encodeShortString);

  const [pendingWord, pendingWordLength] =
    remainder === undefined || remainder.length === 31
      ? ['0x00', 0]
      : [shortStringsEncoded.pop()!, remainder.length];

  return {
    data: shortStringsEncoded.length === 0 ? [] : shortStringsEncoded,
    pending_word: toHex(pendingWord),
    pending_word_len: pendingWordLength,
  };
}

export function splitLongString(longStr: string): string[] {
  const regex = RegExp(`[^]{1,${TEXT_TO_FELT_MAX_LEN}}`, 'g');
  return longStr.match(regex) || [];
} 