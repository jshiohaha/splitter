import { expect } from "chai";
import { PublicKey, Keypair } from "@solana/web3.js";
import fs from "fs";

import { SPLIT_SEED, SPLIT_PROGRAM_ID, SPLIT_UUID_LEN, LOCAL_WALLET_PATH } from './constants';

export const expectThrowsAsync = async (method, errorMessage = undefined) => {
    let error = null;
    try {
        await method();
    } catch (err) {
        error = err;
    }
    expect(error).to.be.an("Error");
    if (errorMessage) {
        expect(error.message).to.equal(errorMessage);
    }
};

export const getSplitAccount = async (uuid: string) => {
    return await PublicKey.findProgramAddress(
        [Buffer.from(SPLIT_SEED), Buffer.from(uuid)],
        SPLIT_PROGRAM_ID
    );
};

export const provideWallet = () => {
    if (!LOCAL_WALLET_PATH || LOCAL_WALLET_PATH.length === 0) {
        throw Error("Local wallet path not set via LOCAL_WALLET_PATH env var");
    }

    return Keypair.fromSecretKey(
        new Uint8Array(JSON.parse(fs.readFileSync(LOCAL_WALLET_PATH, "utf8")))
    );
}

export function getUuid() {
    return Keypair.generate().publicKey
            .toBase58().slice(0, SPLIT_UUID_LEN);
}
