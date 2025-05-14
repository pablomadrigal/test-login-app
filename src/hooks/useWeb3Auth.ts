import { useState, useEffect } from "react";
import { Web3AuthNoModal } from "@web3auth/no-modal";
import { CHAIN_NAMESPACES, UX_MODE, WALLET_ADAPTERS, WEB3AUTH_NETWORK, type IProvider } from "@web3auth/base";
import { CommonPrivateKeyProvider } from "@web3auth/base-provider";
import { AuthAdapter } from "@web3auth/auth-adapter";
import * as starkwareCrypto from "@starkware-industries/starkware-crypto-utils";
import { Account, addAddressPadding, CallData, encode, EthSigner, hash, RpcProvider, cairo, stark, constants } from "starknet";

import CompiledAccountContractAbi from "../abi/ArgentAccount.json";
import compiledEthAccount from "../abi/openzeppelin_EthAccountUpgradeable090.sierra.json";

const clientId = import.meta.env.VITE_WEBAUTH_CLIENT_ID || "";
const rcpUrl = import.meta.env.VITE_RPC_URL || "";
const web3Network = import.meta.env.VITE_WEB3_NETWORK == "devnet" ? WEB3AUTH_NETWORK.SAPPHIRE_DEVNET : WEB3AUTH_NETWORK.SAPPHIRE_DEVNET;

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
            } catch (error) {
                console.error(error);
                console.log(JSON.stringify(error, null, 2));
            }
        };

        init();
    }, []);

    const login = async () => {
        if (!web3auth) {
            console.log("web3auth not initialized yet");
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
            console.log("web3auth not initialized yet");
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
            console.log("web3auth not initialized yet");
            return;
        }
        try {
            const user = await web3auth.getUserInfo();
            console.log(JSON.stringify(user, null, 2));
        } catch (error) {
            console.error(error);
        }
    };

    const getStarkAccount = async () => {
        if (!provider) {
            console.log("provider not initialized yet");
            return;
        }
        try {
            const privateKey = await provider.request({ method: "private_key" }) as string;
            const keyPair = starkwareCrypto.ec.keyFromPrivate(privateKey, "hex");
            const account = starkwareCrypto.ec.keyFromPublic(
                keyPair.getPublic(true, "hex"),
                "hex"
            );
            console.log("account", account);
            return account;
        } catch (error) {
            console.error(error);
        }
    };

    const getStarkKey = async () => {
        if (!provider) {
            console.log("provider not initialized yet");
            return;
        }
        try {
            const account = await getStarkAccount();
            if (account) {
                const publicKeyX = account.pub.getX().toString("hex");
                console.log(publicKeyX);
                return publicKeyX;
            }
        } catch (error) {
            console.error(error);
        }
    };

    const calcultePublicAddress = async () => {
        if (!provider) {
            console.log("provider not initialized yet");
            return;
        }
        try {
            const account = await getStarkAccount();

            if (account) {
                const myCallData = new CallData(compiledEthAccount.abi);
                const ethFullPublicKey = account.pub.getX().toString("hex");
                const accountETHconstructorCalldata = myCallData.compile('constructor', {
                    public_key: ethFullPublicKey,
                });
                const salt = ethFullPublicKey.low;
                const accountEthClassHash = hash.calculateContractAddressFromHash(salt, ETH_ACCOUNT_CLASS_HASH, accountETHconstructorCalldata, 0);
                console.log('Pre-calculated account address=', accountEthClassHash);
            }
        } catch (error) {
            console.error(error);
        }
    }

    //basado en https://github.com/PhilippeR26/starknet.js-workshop-typescript/blob/bbd1f8c1184bbe9af52353678d3f909a65422cf8/src/scripts/Starknet13/Starknet13-goerli/4.createNewETHaccount.ts#L31
    //por documentacion desactualizada
    const deployAccount = async () => {
        if (!provider) {
            console.log("provider not initialized yet");
            return;
        }
        try {
            const privateKeyETH = await provider.request({ method: "private_key" }) as string;
            console.log('privateKeyETH', privateKeyETH);
            const ethSigner = new EthSigner(`0x${privateKeyETH}`);
            const ethFullPublicKey = await ethSigner.getPubKey();
            const pubKeyETHx = cairo.uint256(addAddressPadding(encode.addHexPrefix(ethFullPublicKey.slice(4, -64))));
            const salt = pubKeyETHx.low;

            const starkProvider = new RpcProvider({ nodeUrl: rcpUrl });
            const myCallData = new CallData(compiledEthAccount.abi);
                
            console.log('ethFullPublicKey', ethFullPublicKey);
            const accountETHconstructorCalldata = myCallData.compile('constructor', {
                public_key: ethFullPublicKey,
            });
            const accountEthClassHash = hash.calculateContractAddressFromHash(salt, ETH_ACCOUNT_CLASS_HASH, accountETHconstructorCalldata, 0);
            console.log('accountEthClassHash', accountEthClassHash);
            const starknetAccount = new Account(starkProvider, ETH_ACCOUNT_CLASS_HASH, ethSigner, undefined, constants.TRANSACTION_VERSION.V3);
            console.log('starknetAccount', starknetAccount);
            const deployPayload = {
                classHash: ETH_ACCOUNT_CLASS_HASH,
                constructorCalldata: accountETHconstructorCalldata,
                addressSalt: salt,
            };
            const { suggestedMaxFee: feeDeploy } = await starknetAccount.estimateAccountDeployFee(deployPayload);
            console.log('feeDeploy', feeDeploy);
            /*const { transaction_hash, contract_address } = await starknetAccount.deployAccount(
                deployPayload,
                { maxFee: stark.estimatedFeeToMaxFee(feeDeploy, 100) }
                // Extra fee to fund the validation of the transaction
            );*/
            //await starkProvider.waitForTransaction(transaction_hash);
        } catch (error) {
            console.error(error);
        }
    }


const deployAccountTest = async () => {
    if (!provider) {
        console.log("provider not initialized yet");
        return;
    }
    try {
        console.log("deployAccount");
        const account = await getStarkAccount();
        if (account) {

            const contract = JSON.parse(JSON.stringify(CompiledAccountContractAbi));

            /*const response = await defaultProvider.deployContract({
                contract,
            });*/

            //return response;
        }
    } catch (error) {
        console.error(error);
    }
};


return {
    loggedIn,
    provider,
    login,
    logout,
    getUserInfo,
    getStarkAccount,
    getStarkKey,
    deployAccount,
};
}; 