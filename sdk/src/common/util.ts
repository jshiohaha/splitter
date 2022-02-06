import { Keypair } from "@solana/web3.js";
import { SPLIT_INIT_SEED_LEN } from "./constant";

export const sleep = async (ms: number) => {
    await new Promise((response) =>
        setTimeout(() => {
            response(0);
        }, ms)
    );
};

export const generateSeed = () => {
    return Keypair.generate()
        .publicKey.toBase58()
        .slice(0, SPLIT_INIT_SEED_LEN);
};
