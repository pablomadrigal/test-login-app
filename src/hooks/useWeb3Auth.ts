import { useState, useEffect } from "react";
import { Web3AuthNoModal } from "@web3auth/no-modal";
import { CHAIN_NAMESPACES, UX_MODE, WALLET_ADAPTERS, WEB3AUTH_NETWORK, type IProvider } from "@web3auth/base";
import { CommonPrivateKeyProvider } from "@web3auth/base-provider";
import { AuthAdapter } from "@web3auth/auth-adapter";
import * as starkwareCrypto from "@starkware-industries/starkware-crypto-utils";
import { Account, CallData, hash, RpcProvider } from "starknet";

const clientId = import.meta.env.VITE_WEBAUTH_CLIENT_ID || "";
const rcpUrl = import.meta.env.VITE_RPC_URL || "";
const web3Network = import.meta.env.VITE_WEB3_NETWORK == "devnet" ? WEB3AUTH_NETWORK.SAPPHIRE_DEVNET : WEB3AUTH_NETWORK.SAPPHIRE_DEVNET;
const anvuUrl = import.meta.env.VITE_ANVU_URL || "";
const anvuApiKey = import.meta.env.VITE_AVNU_PAYMASTER_API_KEY || "";

const chainConfig = {
    chainNamespace: CHAIN_NAMESPACES.OTHER,
    chainId: "0xaa36a7",
    rpcTarget: rcpUrl,
    displayName: "StarkNet Testnet",
    blockExplorerUrl: "https://sepolia.etherscan.io",
    ticker: "STRK",
    tickerName: "StarkNet",
};

const ARGENT_ACCOUNT_CLASS_HASH = "0x036078334509b514626504edc9fb252328d1a240e4e948bef8d0c08dff45927f";
const ETH_ACCOUNT_CLASS_HASH = '0x23e416842ca96b1f7067693892ed00881d97a4b0d9a4c793b75cb887944d98d';

export const useWeb3Auth = () => {
    const [web3auth, setWeb3auth] = useState<Web3AuthNoModal | null>(null);
    const [provider, setProvider] = useState<IProvider | null>(null);
    const [loggedIn, setLoggedIn] = useState<boolean>(false);
    const [rpcProvider, setRpcProvider] = useState<RpcProvider | null>(null);

    useEffect(() => {
        const init = async () => {
            try {
                const privateKeyProvider = new CommonPrivateKeyProvider({
                    config: { chainConfig },
                });

                const web3authInstance = new Web3AuthNoModal({
                    clientId,
                    privateKeyProvider,
                    web3AuthNetwork: web3Network,
                });

                const authAdapter = new AuthAdapter({
                    adapterSettings: {
                        uxMode: UX_MODE.REDIRECT,
                    },
                });
                web3authInstance.configureAdapter(authAdapter);
                setWeb3auth(web3authInstance);

                await web3authInstance.init();
                setProvider(web3authInstance.provider);
                if (web3authInstance.connectedAdapterName) {
                    setLoggedIn(true);
                }
                setRpcProvider(new RpcProvider({ nodeUrl: rcpUrl }));
            } catch (error) {
                console.error(error);
            }
        };

        init();
    }, []);

    const login = async () => {
        if (!web3auth) {
            console.error("web3auth not initialized yet");
            return;
        }
        try {
            const web3authProvider = await web3auth.connectTo(WALLET_ADAPTERS.AUTH, {
                loginProvider: "email_passwordless",
                extraLoginOptions: {
                    login_hint: "pajmq2@gmail.com",
                },
            });
            setProvider(web3authProvider);
            setLoggedIn(true);
        } catch (error) {
            console.error(error);
        }
    };

    const logout = async () => {
        if (!web3auth) {
            console.error("web3auth not initialized yet");
            return;
        }
        try {
            await web3auth.logout();
            setProvider(null);
            setLoggedIn(false);
        } catch (error) {
            console.error(error);
        }
    };

    const getUserInfo = async () => {
        if (!web3auth) {
            console.error("web3auth not initialized yet");
            return;
        }
        try {
            const user = await web3auth.getUserInfo();
            console.log(JSON.stringify(user, null, 2));
        } catch (error) {
            console.error(error);
        }
    };

    const getStarknetKeyPair = async () => {
        if (!provider) {
            console.error("provider not initialized yet");
            return;
        }
        try {
            const privateKey = await provider.request({ method: "private_key" }) as string;
            const keyPair = starkwareCrypto.ec.keyFromPrivate(privateKey, "hex");
            return keyPair;
        } catch (error) {
            console.error(error);
        }
        
    }

    const getStarkAccount = async () => {
        if (!provider) {
            console.error("provider not initialized yet");
            return;
        }
        try {
            const privateKey = await provider.request({ method: "private_key" }) as string;
            console.log('private key', privateKey);

            //const keyPair = starkwareCrypto.keyDerivation.getKeyPairFromPath(privateKey, "m/12381/3600/0/0/0");
            const keyPair = starkwareCrypto.ec.keyFromPrivate(privateKey, "hex");
            console.log('keyPair', keyPair);
            const foo = keyPair.getPrivate(true, "hex");
            console.log('private starknet key', foo);
            const foo2 = keyPair.getPublic(true, "hex");
            console.log('public starknet key', foo2);
            const account = starkwareCrypto.ec.keyFromPublic(
                keyPair.getPublic(true, "hex"),
                "hex"
            );
            return account;
        } catch (error) {
            console.error(error);
        }
    };

    const getStarkNetPublicKey = async () => {
        if (!provider) {
            console.error("provider not initialized yet");
            return;
        }
        try {
            const account = await getStarkAccount();
            if (account) {
                const publicKeyX = `0x${account.pub.getX().toString("hex")}`;
                return publicKeyX;
            }
        } catch (error) {
            console.error(error);
        }
    };

    const calculteAccountPublicAddress = async () => {
        if (!provider) {
            console.error("provider not initialized yet");
            return;
        }
        try {
            const publicKeyHex = await getStarkNetPublicKey();
            if (publicKeyHex) {
                const ArgentAAConstructorCallData = CallData.compile({
                    owner: publicKeyHex,
                    guardian: '0',
                });
                const AccountHexContractAddress = hash.calculateContractAddressFromHash(
                    publicKeyHex,
                    ARGENT_ACCOUNT_CLASS_HASH,
                    ArgentAAConstructorCallData,
                    0
                );
                return AccountHexContractAddress;
            }
        } catch (error) {
            console.error(error);
        }
    }

    const deployAccount = async () => {
        if (!provider) {
            console.error("provider not initialized yet");
            return;
        }
        try {
            const publicKeyHex = await getStarkNetPublicKey();
            if (publicKeyHex && rpcProvider) {
                const ArgentAAConstructorCallData = CallData.compile({
                    owner: publicKeyHex,
                    guardian: '0',
                });
                const AccountHexContractAddress = hash.calculateContractAddressFromHash(
                    publicKeyHex,
                    ARGENT_ACCOUNT_CLASS_HASH,
                    ArgentAAConstructorCallData,
                    0
                );

                const anvuResponse = await fetch(`${anvuUrl}/paymaster/v1/accounts/${publicKeyHex}/compatible`, {
                    method: "GET"
                });

                const deploymentData = {
                    class_hash: ARGENT_ACCOUNT_CLASS_HASH,
                    salt: AccountHexContractAddress,
                    unique: true,
                    calldata: ArgentAAConstructorCallData,
                    sigdata: []
                };

                const buildTypedDataResponse = await fetch(`${anvuUrl}/paymaster/v1/build-typed-data`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "api-key": anvuApiKey,
                    },
                    body: JSON.stringify({
                        userAddress: AccountHexContractAddress,
                        calls: [],
                        accountClassHash: ARGENT_ACCOUNT_CLASS_HASH,
                        deploymentData
                    })
                });

                if (!buildTypedDataResponse.ok) {
                    throw new Error('Failed to build typed data');
                }

                const typedData = await buildTypedDataResponse.json();
                console.log(typedData);

                const keyPair = await getStarknetKeyPair();
                
                const signature = await starkwareCrypto.sign(keyPair, JSON.stringify(typedData))
                console.log('signature', signature);

                const executeResponse = await fetch(`${anvuUrl}/paymaster/v1/execute`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "api-key": anvuApiKey,
                    },
                    body: JSON.stringify({
                        userAddress: AccountHexContractAddress,
                        typedData: typedData,
                        signature: [signature],
                        deploymentData
                    })
                });

                if (!executeResponse.ok) {
                    throw new Error('Failed to execute deployment');
                }

                const executeResult = await executeResponse.json();
                console.log('Deployment transaction hash:', executeResult.transactionHash);

                //const { transaction_hash: AXdAth, contract_address: AXcontractFinalAddress } = await accountAX.deployAccount(deployAccountPayload);
                //console.log('transaction_hash', AXdAth);
                //console.log('contract_address', AXcontractFinalAddress);
            }
        } catch (error) {
            console.error(error);
        }
    }

    return {
        loggedIn,
        provider,
        login,
        logout,
        getUserInfo,
        getStarkAccount,
        getStarkNetPublicKey,
        calculteAccountPublicAddress,
        deployAccount,
    };
}; 