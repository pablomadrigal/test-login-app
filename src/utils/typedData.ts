import type { TypedData } from "@starknet-io/types-js";
import { TypedDataRevision as Revision } from "@starknet-io/types-js";
import type { BigNumberish, StarknetEnumType, StarknetMerkleType, StarknetType } from "starknet";
import { MerkleTree } from "./merkle";
import { RANGE_I128, PRIME, revisionConfiguration } from "./constants";
import { getSelectorFromName } from "./hash";
import { byteArrayFromString, encodeShortString, toHex } from "./encoding";
import assert, { assertRange, isBoolean, isHex, isString } from "./validation";
import { RANGE_FELT, RANGE_U128 } from "./constants";

interface Context {
  parent?: string;
  key?: string;
}

export function getMessageHash(typedData: TypedData, accountAddress: BigNumberish): string {
  if (!validateTypedData(typedData)) {
    throw new Error('Typed data does not match JSON schema');
  }

  const revision = identifyRevision(typedData) as Revision;
  const { domain, hashMethod } = revisionConfiguration[revision];

  const message = [
    encodeShortString('StarkNet Message'),
    getStructHash(typedData.types, domain, typedData.domain, revision),
    accountAddress,
    getStructHash(typedData.types, typedData.primaryType, typedData.message, revision),
  ];

  return hashMethod(message);
}

export function getStructHash<T extends TypedData>(
  types: T['types'],
  type: string,
  data: T['message'],
  revision: Revision = Revision.LEGACY
): string {
  return revisionConfiguration[revision].hashMethod(encodeData(types, type, data, revision)[1]);
}

export function validateTypedData(data: unknown): data is TypedData {
  const typedData = data as TypedData;
  return Boolean(
    typedData.message && typedData.primaryType && typedData.types && identifyRevision(typedData)
  );
}

function identifyRevision({ types, domain }: TypedData) {
  if (revisionConfiguration[Revision.ACTIVE].domain in types && domain.revision === Revision.ACTIVE)
    return Revision.ACTIVE;

  if (
    revisionConfiguration[Revision.LEGACY].domain in types &&
    (domain.revision ?? Revision.LEGACY) === Revision.LEGACY
  )
    return Revision.LEGACY;

  return undefined;
}

export function encodeData<T extends TypedData>(
  types: T['types'],
  type: string,
  data: T['message'],
  revision: Revision = Revision.LEGACY
): [string[], string[]] {
  const targetType = types[type] ?? revisionConfiguration[revision].presetTypes[type];
  const [returnTypes, values] = targetType.reduce<[string[], string[]]>(
    ([ts, vs], field) => {
      if (
        data[field.name as keyof T['message']] === undefined ||
        (data[field.name as keyof T['message']] === null && field.type !== 'enum')
      ) {
        throw new Error(`Cannot encode data: missing data for '${field.name}'`);
      }

      const value = data[field.name as keyof T['message']];
      const ctx = { parent: type, key: field.name };
      const [t, encodedValue] = encodeValue(types, field.type, value, ctx, revision);

      return [
        [...ts, t],
        [...vs, encodedValue],
      ];
    },
    [['felt'], [getTypeHash(types, type, revision)]]
  );

  return [returnTypes, values];
}

export function encodeValue(
  types: TypedData['types'],
  type: string,
  data: unknown,
  ctx: Context = {},
  revision: Revision = Revision.LEGACY
): [string, string] {
  if (types[type]) {
    return [type, getStructHash(types, type, data as TypedData['message'], revision)];
  }

  if (revisionConfiguration[revision].presetTypes[type]) {
    return [
      type,
      getStructHash(
        revisionConfiguration[revision].presetTypes,
        type,
        data as TypedData['message'],
        revision
      ),
    ];
  }

  if (type.endsWith('*')) {
    const hashes: string[] = (data as Array<TypedData['message']>).map(
      (entry) => encodeValue(types, type.slice(0, -1), entry, undefined, revision)[1]
    );
    return [type, revisionConfiguration[revision].hashMethod(hashes)];
  }

  switch (type) {
    case 'enum': {
      if (revision === Revision.ACTIVE) {
        const [variantKey, variantData] = Object.entries(data as TypedData['message'])[0];

        const parentType = types[ctx.parent as string].find((t) => t.name === ctx.key);
        const enumType = types[(parentType as StarknetEnumType).contains];
        const variantType = enumType.find((t) => t.name === variantKey) as StarknetType;
        const variantIndex = enumType.indexOf(variantType);

        const encodedSubtypes = variantType.type
          .slice(1, -1)
          .split(',')
          .map((subtype, index) => {
            if (!subtype) return subtype;
            const subtypeData = (variantData as unknown[])[index];
            return encodeValue(types, subtype, subtypeData, undefined, revision)[1];
          });
        return [
          type,
          revisionConfiguration[revision].hashMethod([variantIndex, ...encodedSubtypes]),
        ];
      }
      return [type, getHex(data as string)];
    }
    case 'merkletree': {
      const merkleTreeType = getMerkleTreeType(types, ctx);
      const structHashes: string[] = (data as Array<TypedData['message']>).map((struct) => {
        return encodeValue(types, merkleTreeType, struct, undefined, revision)[1];
      });
      const { root } = new MerkleTree(
        structHashes as string[],
        revisionConfiguration[revision].hashMerkleMethod
      );
      return ['felt', root];
    }
    case 'selector': {
      return ['felt', prepareSelector(data as string)];
    }
    case 'string': {
      if (revision === Revision.ACTIVE) {
        const byteArray = byteArrayFromString(data as string);
        const elements = [
          byteArray.data.length,
          ...byteArray.data,
          byteArray.pending_word,
          byteArray.pending_word_len,
        ];
        return [type, revisionConfiguration[revision].hashMethod(elements)];
      }
      return [type, getHex(data as string)];
    }
    case 'i128': {
      if (revision === Revision.ACTIVE) {
        const value = BigInt(data as string);
        assertRange(value, type, RANGE_I128);
        return [type, getHex(value < 0n ? PRIME + value : value)];
      }
      return [type, getHex(data as string)];
    }
    case 'timestamp':
    case 'u128': {
      if (revision === Revision.ACTIVE) {
        assertRange(data, type, RANGE_U128);
      }
      return [type, getHex(data as string)];
    }
    case 'felt':
    case 'shortstring': {
      if (revision === Revision.ACTIVE) {
        assertRange(getHex(data as string), type, RANGE_FELT);
      }
      return [type, getHex(data as string)];
    }
    case 'ClassHash':
    case 'ContractAddress': {
      if (revision === Revision.ACTIVE) {
        assertRange(data, type, RANGE_FELT);
      }
      return [type, getHex(data as string)];
    }
    case 'bool': {
      if (revision === Revision.ACTIVE) {
        assert(isBoolean(data), `Type mismatch for ${type} ${data}`);
      }
      return [type, getHex(data as string)];
    }
    default: {
      if (revision === Revision.ACTIVE) {
        throw new Error(`Unsupported type: ${type}`);
      }
      return [type, getHex(data as string)];
    }
  }
}

export function getTypeHash(
  types: TypedData['types'],
  type: string,
  revision: Revision = Revision.LEGACY
): string {
  return getSelectorFromName(encodeType(types, type, revision));
}

export function encodeType(
  types: TypedData['types'],
  type: string,
  revision: Revision = Revision.LEGACY
): string {
  const allTypes =
    revision === Revision.ACTIVE
      ? { ...types, ...revisionConfiguration[revision].presetTypes }
      : types;
  const [primary, ...dependencies] = getDependencies(
    allTypes,
    type,
    undefined,
    undefined,
    revision
  );
  const newTypes = !primary ? [] : [primary, ...dependencies.sort()];

  const esc = revisionConfiguration[revision].escapeTypeString;

  return newTypes
    .map((dependency) => {
      const dependencyElements = allTypes[dependency].map((t) => {
        const targetType =
          t.type === 'enum' && revision === Revision.ACTIVE
            ? (t as StarknetEnumType).contains
            : t.type;
        const typeString = targetType.match(/^\(.*\)$/)
          ? `(${targetType
            .slice(1, -1)
            .split(',')
            .map((e) => (e ? esc(e) : e))
            .join(',')})`
          : esc(targetType);
        return `${esc(t.name)}:${typeString}`;
      });
      return `${esc(dependency)}(${dependencyElements})`;
    })
    .join('');
}


/**
 * Prepares the selector for later use, if it's not already in correct format.
 * The selector in correct format is the starknet_keccak hash of the function name, encoded in ASCII.
 *
 * @param {string} selector - The selector to be prepared.
 * @returns {string} The prepared selector.
 *
 * @example
 * ```typescript
 * const result1 = prepareSelector('0xc14cfe23f3fa7ce7b1f8db7d7682305b1692293f71a61cc06637f0d8d8b6c8');
 * // result1 = '0xc14cfe23f3fa7ce7b1f8db7d7682305b1692293f71a61cc06637f0d8d8b6c8'
 *
 * const result2 =  prepareSelector('myFunction');
 * // result2 = '0xc14cfe23f3fa7ce7b1f8db7d7682305b1692293f71a61cc06637f0d8d8b6c8'
 * ```
 */
export function prepareSelector(selector: string): string {
    return isHex(selector) ? selector : getSelectorFromName(selector);
  }
  

export function getHex(value: BigNumberish): string {
    try {
      return toHex(value);
    } catch (e) {
      if (isString(value)) {
        return toHex(encodeShortString(value));
      }
      throw new Error(`Invalid BigNumberish: ${value}`);
    }
  }

export function getDependencies(
  types: TypedData['types'],
  type: string,
  dependencies: string[] = [],
  contains: string = '',
  revision: Revision = Revision.LEGACY
): string[] {
  let dependencyTypes: string[] = [type];

  if (type[type.length - 1] === '*') {
    dependencyTypes = [type.slice(0, -1)];
  } else if (revision === Revision.ACTIVE) {
    if (type === 'enum') {
      dependencyTypes = [contains];
    } else if (type.match(/^\(.*\)$/)) {
      dependencyTypes = type
        .slice(1, -1)
        .split(',')
        .map((depType) => (depType[depType.length - 1] === '*' ? depType.slice(0, -1) : depType));
    }
  }

  return dependencyTypes
    .filter((t) => !dependencies.includes(t) && types[t])
    .reduce<string[]>(
      (p, depType) => [
        ...p,
        ...[
          depType,
          ...(types[depType] as StarknetEnumType[]).reduce<string[]>(
            (previous, t) => [
              ...previous,
              ...getDependencies(types, t.type, previous, t.contains, revision).filter(
                (dependency) => !previous.includes(dependency)
              ),
            ],
            []
          ),
        ].filter((dependency) => !p.includes(dependency)),
      ],
      []
    );
}

export function isMerkleTreeType(type: StarknetType): type is StarknetMerkleType {
  return type.type === 'merkletree';
}

function getMerkleTreeType(types: TypedData['types'], ctx: Context) {
  if (ctx.parent && ctx.key) {
    const parentType = types[ctx.parent];
    const merkleType = parentType.find((t) => t.name === ctx.key)!;
    const isMerkleTree = isMerkleTreeType(merkleType);
    if (!isMerkleTree) {
      throw new Error(`${ctx.key} is not a merkle tree`);
    }
    if (merkleType.contains.endsWith('*')) {
      throw new Error(`Merkle tree contain property must not be an array but was given ${ctx.key}`);
    }
    return merkleType.contains;
  }
  return 'raw';
} 