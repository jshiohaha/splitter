import { Connection, PublicKey } from "@solana/web3.js";
import { Token } from "@solana/spl-token";

export interface ITokenData {
    tokenMint: PublicKey;
    tokenAcc: PublicKey;
    owner: PublicKey;
    token: Token;
}

export class AccountUtils {
    connection: Connection;

    constructor(connection: Connection) {
        this.connection = connection;
    }

    // ============================================================================
    // pda functions
    // ============================================================================

    findProgramAddress = async (
        programId: PublicKey,
        seeds: (PublicKey | Uint8Array | string)[]
    ): Promise<[PublicKey, number]> => {
        const seed_bytes = seeds.map((s) => {
            if (typeof s == "string") {
                return Buffer.from(s);
            } else if ("toBytes" in s) {
                return s.toBytes();
            } else {
                return s;
            }
        });

        return await PublicKey.findProgramAddress(seed_bytes, programId);
    };

    // ============================================================================
    // normal account functions
    // ============================================================================

    getBalance = async (publicKey: PublicKey): Promise<number> => {
        return this.connection.getBalance(publicKey);
    };
}
