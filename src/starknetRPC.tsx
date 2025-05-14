import * as starkwareCrypto from "@starkware-industries/starkware-crypto-utils";
import type { IProvider } from "@web3auth/base";
import type { DeployContractResponse } from "starknet";
import { defaultProvider } from "starknet";

import CompiledAccountContractAbi from "./ArgentAccount.json";

export default class StarkNetRpc {
    private provider: IProvider;

    constructor(provider: IProvider) {
        this.provider = provider;
    }

    getStarkAccount = async (): Promise<any> => {
        try {
            const privateKey = await this.provider.request({ method: "private_key" });
            const keyPair = starkwareCrypto.ec.keyFromPrivate(privateKey, "hex");
            const account = starkwareCrypto.ec.keyFromPublic(
                keyPair.getPublic(true, "hex"),
                "hex"
            );
            return account;
        } catch (error) {
            return error;
        }
    };

    getStarkKey = async (): Promise<string | undefined> => {
        try {
            const account = await this.getStarkAccount();
            const publicKeyX = account.pub.getX().toString("hex");
            return publicKeyX;
        } catch (error) {
            return error as string;
        }
    };

    deployAccount = async (): Promise<
        DeployContractResponse | string | undefined
    > => {
        try {
            const account = await this.getStarkAccount();
            if (account) {
                const contract = JSON.parse(JSON.stringify(CompiledAccountContractAbi));
                // @ts-ignore
                const response = await defaultProvider.deployContract({
                    contract,
                });

                return response;
            }
        } catch (error) {
            return error as string;
        }
        return undefined;
    };
}