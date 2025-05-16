import { keccak, pedersen, poseidonHash, poseidonHashMany } from "@scure/starknet";
import type { BigNumberish } from "starknet";
import { MASK_250 } from "./constants";
import { addHexPrefix, toHex, utf8ToArray } from "./encoding";

export function computePoseidonHashOnElements(data: BigNumberish[]) {
  return toHex(poseidonHashMany(data.map((x) => BigInt(x))));
}

export function computePoseidonHash(a: BigNumberish, b: BigNumberish): string {
  return toHex(poseidonHash(BigInt(a), BigInt(b)));
}

export function computePedersenHash(a: BigNumberish, b: BigNumberish): string {
  return pedersen(BigInt(a), BigInt(b));
}

export function computePedersenHashOnElements(data: BigNumberish[]): string {
  return [...data, data.length]
    .reduce((x: BigNumberish, y: BigNumberish) => pedersen(BigInt(x), BigInt(y)), 0)
    .toString();
}

export function getSelectorFromName(funcName: string) {
  return toHex(starknetKeccak(funcName));
}

export function starknetKeccak(str: string): bigint {
  const hash = BigInt(keccakHex(str));
  return hash & MASK_250;
}

function keccakHex(str: string): string {
  return addHexPrefix(keccak(utf8ToArray(str)).toString(16));
} 