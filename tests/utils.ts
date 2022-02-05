import * as anchor from "@project-serum/anchor";
import { expect } from "chai";
import {
    PublicKey,
    Keypair,
    LAMPORTS_PER_SOL,
  } from "@solana/web3.js";
import fs from "fs";
import * as assert from "assert";

import { Program } from "@project-serum/anchor";
import { SPLIT_SEED, SPLIT_PROGRAM_ID, SPLIT_INIT_SEED_LEN, LOCAL_WALLET_PATH } from './constants';
import { Split as SplitProgram } from "../target/types/split";

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

export const getSplitAccount = async (seed: string) => {
    return await PublicKey.findProgramAddress(
        [Buffer.from(SPLIT_SEED), Buffer.from(seed)],
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

export const getSeed = () => {
    return Keypair.generate().publicKey
            .toBase58().slice(0, SPLIT_INIT_SEED_LEN);
}


export const getMembers = async (
    program: Program<SplitProgram>,
    address: PublicKey
) => {
    const splitAccount = await program.account.split.fetch(address);
    return splitAccount.members as any[];
}

export const getMember = (members: any[], address: PublicKey) => {
    return members.filter(member => member.address.toString() === address.toString())[0];
}

// prefer this instead of directly comparing account balances because tx fees can invalidate
// direct account balance checks.
export const isAccountDiscrepancyBelowThreshold = (
    expected: number,
    actual: number,
    // diff in SOL, at $200 / SOL = $0.002
    threshold = 0.00001
) => {
    const diff = (expected - actual) / LAMPORTS_PER_SOL;
    return diff < threshold;
}

export const printMemberInfo = (members: any[]) => {
    console.log("===== MEMBER INFO =====");
    for (let i = 0; i < members.length; i++) {
        const member = members[i];
        console.log('Member : ', i+1);
        console.log('address: ', member.address.toString());
        console.log('share: ', member.share);
        console.log('amount: ', member.amount.toNumber());
    }
    console.log();
};

export const getMembersList = (members: any) => {
    const commonShare = Math.round(100 / members.length);
    const leftOverShare = 100 - (commonShare * members.length);
    assert.ok(commonShare * members.length + leftOverShare === 100);

    return members.map((member, idx) => {
        return {
            'address': member.publicKey,
            'amount': new anchor.BN(0),
            'share': idx === members.length-1
                ? commonShare+leftOverShare
                : commonShare,
        }
    });
}

export const getMemberBalances = async (
    program: Program<SplitProgram>,
    members: any
) => {
    const memberBalances = new Map();
    for (let i = 0; i < members.length; i++) {
        const member = members[i];
        const memberBalance = await program.provider.connection.getBalance(member.address);
        memberBalances.set(member.address.toString(), memberBalance);
    }

    return memberBalances;
}
