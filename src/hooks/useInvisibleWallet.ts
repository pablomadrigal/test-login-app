import { useEffect, useState } from 'react';
import { Account, Provider, ec, hash, type UniversalDeployerContractPayload } from 'starknet';
import { Web3Auth } from '@web3auth/modal';
import { CommonPrivateKeyProvider } from '@web3auth/base-provider';
import { WEB3AUTH_NETWORK, CHAIN_NAMESPACES } from '@web3auth/base';

const ARGENT_ACCOUNT_CLASS_HASH = import.meta.env.VITE_ARGENT_ACCOUNT_CLASS_HASH;

export function useInvisibleWallet() {
  const [account, setAccount] = useState<Account | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      try {
        const chainConfig = {
          chainNamespace: CHAIN_NAMESPACES.OTHER,
          chainId: "0x534e5f5345504f4c4941",
          rpcTarget: `https://starknet-sepolia.infura.io/v3/${import.meta.env.VITE_INFURA_KEY}`,
          displayName: "StarkNet Testnet",
          blockExplorerUrl: "https://sepolia.starkscan.co",
          ticker: "STRK",
          tickerName: "StarkNet",
        };

        const privateKeyProvider = new CommonPrivateKeyProvider({
          config: { chainConfig },
        });

        const web3auth = new Web3Auth({
          clientId: import.meta.env.VITE_WEB3AUTH_CLIENT_ID,
          web3AuthNetwork: WEB3AUTH_NETWORK.SAPPHIRE_MAINNET,
          privateKeyProvider,
        });

        await web3auth.initModal();
        const provider = await web3auth.connect();
        if (!provider) throw new Error('Failed to connect to Web3Auth');

        const privKey = await provider.request({ method: 'private_key' }) as string;
        const keyPair = ec.starkCurve.getStarkKey(privKey);
        const pubKey = keyPair;

        const constructorCalldata = [pubKey];
        const salt = pubKey;

        const accountAddress = hash.calculateContractAddressFromHash(
          salt,
          ARGENT_ACCOUNT_CLASS_HASH,
          constructorCalldata,
          0
        );

        const rpcProvider = new Provider({ nodeUrl: `https://starknet-sepolia.infura.io/v3/${import.meta.env.VITE_INFURA_KEY}` });
        const starknetAccount = new Account(rpcProvider, accountAddress, keyPair);

        try {
          await rpcProvider.getClassHashAt(accountAddress);
        } catch {
          const deployPayload: UniversalDeployerContractPayload = {
            classHash: ARGENT_ACCOUNT_CLASS_HASH,
            constructorCalldata,
            salt,
          };

          await starknetAccount.deploy(deployPayload);
        }

        setAccount(starknetAccount);
      } catch (err) {
        console.error('Failed to init invisible wallet:', err);
      } finally {
        setIsLoading(false);
      }
    };

    init();
  }, []);

  return { account, isLoading };
}