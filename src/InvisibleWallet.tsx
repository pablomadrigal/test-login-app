"use client";

import { useCallback, useEffect, useState } from "react";
import { RpcProvider, constants } from "starknet";
import { ArgentWebWallet, deployAndExecuteWithPaymaster } from "@argent/invisible-sdk";
import type { SessionAccountInterface } from "@argent/invisible-sdk";

const envName = (import.meta.env.VITE_ENV_NAME) as "mainnet" | "sepolia"
const isMainnet = envName === "mainnet";
const chainId = isMainnet ? constants.StarknetChainId.SN_MAIN : constants.StarknetChainId.SN_SEPOLIA;


const ARGENT_DUMMY_CONTRACT_ADDRESS =
    isMainnet ? "0x001c515f991f706039696a54f6f33730e9b0e8cc5d04187b13c2c714401acfd4" : "0x07557a2fbe051e6327ab603c6d1713a91d2cfba5382ac6ca7de884d3278636d7";
const ARGENT_DUMMY_CONTRACT_ENTRYPOINT = "increase_number";

const paymasterParams = !import.meta.env.VITE_AVNU_PAYMASTER_API_KEY ? undefined : {
    apiKey: import.meta.env.VITE_AVNU_PAYMASTER_API_KEY,
}

console.log(paymasterParams, envName);

export function InvisibleWallet() {
    const [account, setAccount] = useState<SessionAccountInterface | undefined>(undefined);
    const [isLoading, setIsLoading] = useState(false);
    const [txHash, setTxHash] = useState<string | undefined>();
    const [requestingApprovals, setRequestingApprovals] = useState<boolean>(false);
    const [counter, setCounter] = useState<bigint | undefined>();
    const [withApproval, setWithApproval] = useState<boolean>(true);
    const [connectStatus, setConnectStatus] = useState<"Connect" | "Connecting" | "Deploying account">("Connect");

    const provider = new RpcProvider({
        chainId: chainId,
        nodeUrl: import.meta.env.VITE_RPC_URL,
        headers: JSON.parse(import.meta.env.VITE_RPC_HEADERS || "{}"),
    });

    const argentWebWallet = ArgentWebWallet.init({
        appName: "Test",
        environment: envName || "sepolia",
        sessionParams: {
            allowedMethods: [
                {
                    contract: ARGENT_DUMMY_CONTRACT_ADDRESS,
                    selector: ARGENT_DUMMY_CONTRACT_ENTRYPOINT,
                },
            ],
            validityDays: Number(import.meta.env.VITE_VALIDITY_DAYS) || undefined,
        },
        paymasterParams,
    });

    useEffect(() => {
        if (!argentWebWallet) {
            return
        }

        argentWebWallet
            .connect()
            .then(async (res) => {
                if (!res) {
                    console.log("Not connected");
                    return;
                }

                console.log("Connected to ArgentWebWallet", res);
                const { account, callbackData, approvalTransactionHash } = res;

                if (account.getSessionStatus() !== "VALID") {
                    console.log("Session is not valid");
                    return;
                }

                console.log("Approval transaction hash", approvalTransactionHash); // -- custom_callback_string
                console.log("Callback data", callbackData); // -- custom_callback_string

                if (approvalTransactionHash && provider) {
                    console.log("Waiting for approval");
                    await provider.waitForTransaction(approvalTransactionHash)
                }

                setAccount(account);
            })
            .catch((err) => {
                console.error("Failed to connect to ArgentWebWallet", err);
            });
    }, []);

    const fetchCounter = useCallback(async (account?: SessionAccountInterface) => {
        if (!account || !provider) {
            return BigInt(0);
        }

        const [counter] = await provider.callContract({
            contractAddress: ARGENT_DUMMY_CONTRACT_ADDRESS,
            entrypoint: "get_number",
            calldata: [account?.address],
        });

        return BigInt(counter);
    }, [account, provider]);

    const handleConnect = async () => {
        try {
            console.log("Start connect, with approval requests: ", withApproval);

            if (!provider) {
                throw new Error("No provider provided");
            }

            setConnectStatus("Connecting")

            const response = await argentWebWallet?.requestConnection({
                callbackData: "custom_callback_data",
                approvalRequests: withApproval ? [
                    {
                        tokenAddress: "0x049D36570D4e46f48e99674bd3fcc84644DdD6b96F7C741B1562B82f9e004dC7",
                        amount: BigInt("100000000000000000").toString(),
                        // Your dapp contract
                        spender: "0x7e00d496e324876bbc8531f2d9a82bf154d1a04a50218ee74cdd372f75a551a",
                    },
                ] : undefined,
            });

            if (response) {
                const { account: sessionAccount } = response
                const isDeployed = await sessionAccount.isDeployed()

                if (response.deploymentPayload && !isDeployed && response.approvalRequestsCalls && paymasterParams) {
                    console.log("Deploying an account");
                    setConnectStatus("Deploying account")

                    const resp = await deployAndExecuteWithPaymaster(sessionAccount, paymasterParams, response.deploymentPayload, response.approvalRequestsCalls)

                    if (resp) {
                        console.log("Deployment hash: ", resp.transaction_hash);

                        await provider.waitForTransaction(resp.transaction_hash)

                        console.log("Account deployed");
                    }

                } else if (response.approvalRequestsCalls) {
                    console.log("Sending Approvals");

                    const { transaction_hash } = await sessionAccount.execute(response.approvalRequestsCalls);

                    console.log("Approvals hash: ", transaction_hash);

                    await provider.waitForTransaction(transaction_hash)

                    console.log("Approvals minted", transaction_hash);
                }

                if (response.approvalTransactionHash) {
                    console.log("Waiting for approval", response.approvalTransactionHash);
                    await provider.waitForTransaction(response.approvalTransactionHash)

                    console.log("Approvals minted", response.approvalTransactionHash);
                }

                setAccount(sessionAccount);
                setConnectStatus("Connect")
            } else {
                console.log("requestConnection response is undefined");
            }
        } catch (err: any) {
            console.error(err);
            setConnectStatus("Connect")
        }
    };

    const handleRequestApprovals = async () => {
        try {
            setRequestingApprovals(true)
            const approvalTxHash = await argentWebWallet.requestApprovals([{
                tokenAddress: "0x049D36570D4e46f48e99674bd3fcc84644DdD6b96F7C741B1562B82f9e004dC7",
                amount: BigInt("100000000000000000").toString(),
                // Your dapp contract
                spender: "0x7e00d496e324876bbc8531f2d9a82bf154d1a04a50218ee74cdd372f75a551a",
            }])

            console.log("Sending request approvals: ", approvalTxHash);
            await provider.waitForTransaction(approvalTxHash)
        } catch (err) {
            console.error(err);
        } finally {
            setRequestingApprovals(false)
        }
    }

    const handleSubmitTransactionButton = async () => {
        try {
            if (!account) {
                throw new Error("Account not connected");
            }
            setIsLoading(true);

            const call = {
                contractAddress: ARGENT_DUMMY_CONTRACT_ADDRESS,
                entrypoint: ARGENT_DUMMY_CONTRACT_ENTRYPOINT,
                calldata: ["0x1"],
            };

            const { resourceBounds: estimatedResourceBounds } = await account.estimateInvokeFee(call, {
                version: "0x3",
            });

            const resourceBounds = {
                ...estimatedResourceBounds,
                l1_gas: {
                    ...estimatedResourceBounds.l1_gas,
                    max_amount: "0x28",
                },
            };

            const { transaction_hash } = await account.execute(call, {
                version: "0x3",
                resourceBounds,
            });

            setTxHash(transaction_hash);

            await account.waitForTransaction(transaction_hash);
            setIsLoading(false);

            const newCounter = await fetchCounter(account);

            setCounter(newCounter);
            setTxHash(undefined);
        } catch (error) {
            console.error(error);
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchCounter(account).then(setCounter);
    }, [account, fetchCounter]);

    const truncateHex = (hex: string) => `${hex.slice(0, 6)}...${hex.slice(-4)}`;

    return (

        <div className="flex flex-col min-h-screen p-8 pb-20 gap-8 sm:p-20 font-[family-name:var(--font-geist-sans)]">
            {!account && (
                <>
                    <label className="text-white p-2 rounded-md w-full max-w-md cursor-pointer">
                        <input type="checkbox" checked={withApproval} onChange={(a) => {
                            setWithApproval(a.currentTarget.checked)
                        }} /> With approval requests
                    </label>
                    <button className="bg-white text-black p-2 rounded-md w-full max-w-md" onClick={handleConnect}
                        disabled={connectStatus !== "Connect"}>
                        {connectStatus}
                    </button>
                </>
            )}

            {account && (
                <>
                    <div className="flex flex-col gap-4 items-start">
                        <div>Account: {account.address}</div>
                        <button
                            className="bg-blue-300 text-black p-2 rounded-md w-full max-w-md"
                            onClick={handleRequestApprovals}
                            disabled={isLoading || requestingApprovals}
                        >
                            {requestingApprovals ? "Requesting" : "Request"} approvals
                        </button>

                        <button
                            className="bg-blue-300 text-black p-2 rounded-md w-full max-w-md"
                            onClick={handleSubmitTransactionButton}
                            disabled={isLoading}
                        >
                            {connectStatus === "Deploying account" ? "Deploying account" : isLoading ? "Sending tx" : "Send tx"}
                        </button>
                    </div>
                    <div className="flex flex-col gap-4">
                        {txHash && (
                            <p>
                                Transaction hash:{" "}
                                <a href={`https://sepolia.starkscan.co/tx/${txHash}`} target="_blank">
                                    <code>{truncateHex(txHash)}</code>
                                </a>
                            </p>
                        )}
                        {counter !== undefined && (
                            <p>
                                Tx counter: <code>{counter.toString()}</code>
                            </p>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}