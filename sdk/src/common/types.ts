import { Keypair, PublicKey } from "@solana/web3.js";

export function isKp(kp: PublicKey | Keypair) {
    return kp instanceof Keypair;
}
