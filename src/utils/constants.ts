import type { TypedData } from "@starknet-io/types-js";
import { TypedDataRevision as Revision } from "@starknet-io/types-js";
import { computePedersenHash } from "./hash";
import { computePedersenHashOnElements } from "./hash";
import { computePoseidonHash, computePoseidonHashOnElements } from "./hash";
import type { Configuration } from "../types/genetal";

export const TEXT_TO_FELT_MAX_LEN = 31;
export const MASK_250 = 2n ** 250n - 1n; // 2 ** 250 - 1
export const ZERO = 0n;
export const PRIME = 2n ** 251n + 17n * 2n ** 192n + 1n;

const range = (min: bigint, max: bigint) => ({ min, max }) as const;

export const RANGE_FELT = range(ZERO, PRIME - 1n);
export const RANGE_I128 = range(-(2n ** 127n), 2n ** 127n - 1n);
export const RANGE_U128 = range(ZERO, 2n ** 128n - 1n);

const presetTypes: TypedData['types'] = {
  u256: JSON.parse('[{ "name": "low", "type": "u128" }, { "name": "high", "type": "u128" }]'),
  TokenAmount: JSON.parse(
    '[{ "name": "token_address", "type": "ContractAddress" }, { "name": "amount", "type": "u256" }]'
  ),
  NftId: JSON.parse(
    '[{ "name": "collection_address", "type": "ContractAddress" }, { "name": "token_id", "type": "u256" }]'
  ),
};

export const revisionConfiguration: Record<Revision, Configuration> = {
  [Revision.ACTIVE]: {
    domain: 'StarknetDomain',
    hashMethod: computePoseidonHashOnElements,
    hashMerkleMethod: computePoseidonHash,
    escapeTypeString: (s) => `"${s}"`,
    presetTypes,
  },
  [Revision.LEGACY]: {
    domain: 'StarkNetDomain',
    hashMethod: computePedersenHashOnElements,
    hashMerkleMethod: computePedersenHash,
    escapeTypeString: (s) => s,
    presetTypes: {},
  },
}; 