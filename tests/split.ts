import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import {
    PublicKey,
    SystemProgram,
    Keypair,
    LAMPORTS_PER_SOL,
} from "@solana/web3.js";

import { Split as SplitProgram } from "../target/types/split";
import { provideWallet, getSplitAccount, getUuid } from "./utils";

// Configure the client to use the local cluster.
const provider = anchor.Provider.env();
anchor.setProvider(provider);

const program = anchor.workspace.Split as Program<SplitProgram>;

// set env var on system before running tests.
// on osx, this is `export LOCAL_WALLET_PATH="REPLACE_WITH_PATH_TO_LOCAL_WALLET"
// this is something like /Users/myusername/.config/solana/id.json
const myWallet = provideWallet();

export const printMemberInfo = (members: any[]) => {
    console.log("===== MEMBER INFO =====");
    for (let i = 0; i < members.length; i++) {
        const member = members[i];
        console.log('Member : ', i+1);
        console.log('address: ', member.address.toString());
        console.log('share: ', member.share.toNumber());
        console.log('amount: ', member.amount.toNumber());
    }
    console.log();
};

describe("split", async () => {
    const uuid = getUuid();
    const [splitAddress, splitBump] = await getSplitAccount(uuid);
    const randomMember = Keypair.generate();

    it("Is initialized!", async () => {
        // Add your test here.
        const tx = await program.rpc.initialize(
            splitBump,
            uuid,
            [
                {
                    address: myWallet.publicKey,
                    // we will ignore amount when initializing account
                    amount: new anchor.BN(0),
                    share: new anchor.BN(40),
                },
                {
                    address: randomMember.publicKey,
                    amount: new anchor.BN(0),
                    share: new anchor.BN(60),
                },
            ],
            {
                accounts: {
                    payer: myWallet.publicKey,
                    split: splitAddress,
                    systemProgram: SystemProgram.programId,
                },
                signers: [myWallet],
            }
        );

        // fetch account and assert
        const splitAccount = await program.account.split.fetch(splitAddress);
        // console.log("splitAccount: ", splitAccount);

        const members = splitAccount.members as any[];
        printMemberInfo(members);
    });

    // try to withdraw, expect exception.
    // try to withdraw with non-member. expect exception.
    it("Allocate Member Funds!", async () => {
        // Add your test here.
        await program.rpc.allocateMemberFunds(splitBump, uuid, false, {
            accounts: {
                payer: myWallet.publicKey,
                split: splitAddress,
                systemProgram: SystemProgram.programId,
            },
            instructions: [
                SystemProgram.transfer({
                    fromPubkey: myWallet.publicKey,
                    toPubkey: splitAddress,
                    lamports: 1 * LAMPORTS_PER_SOL,
                }),
            ],
            signers: [myWallet],
        });

        // verify treasury balance has not changed
        const splitAccountBalance =
            await program.provider.connection.getBalance(splitAddress);
        console.log("splitAccountBalance: ", splitAccountBalance);

        // fetch account and assert
        const splitAccount = await program.account.split.fetch(splitAddress);
        // console.log("splitAccount: ", splitAccount);

        const members = splitAccount.members as any[];
        printMemberInfo(members);
    });

    // try to withdraw, expect exception.
    // try to withdraw with non-member. expect exception.
    it("Withdraw my funds!", async () => {
        // Add your test here.
        await program.rpc.withdraw(splitBump, uuid, {
            accounts: {
                payer: myWallet.publicKey,
                split: splitAddress,
                systemProgram: SystemProgram.programId,
            },
            signers: [myWallet],
        });

        // verify treasury balance has not changed
        const splitAccountBalance =
            await program.provider.connection.getBalance(splitAddress);
        console.log("splitAccountBalance: ", splitAccountBalance);

        // fetch account and assert
        const splitAccount = await program.account.split.fetch(splitAddress);
        // console.log("splitAccount: ", splitAccount);

        const members = splitAccount.members as any[];
        printMemberInfo(members);
    });

    // try to withdraw, expect exception.
    // try to withdraw with non-member. expect exception.
    it("Allocate Member Funds 2222", async () => {
        // Add your test here.
        await program.rpc.allocateMemberFunds(splitBump, uuid, true, {
            accounts: {
                payer: myWallet.publicKey,
                split: splitAddress,
                systemProgram: SystemProgram.programId,
            },
            instructions: [
                SystemProgram.transfer({
                    fromPubkey: myWallet.publicKey,
                    toPubkey: splitAddress,
                    lamports: 1 * LAMPORTS_PER_SOL,
                }),
            ],
            signers: [myWallet],
        });

        // verify treasury balance has not changed
        const splitAccountBalance =
            await program.provider.connection.getBalance(splitAddress);
        console.log("splitAccountBalance: ", splitAccountBalance);

        // fetch account and assert
        const splitAccount = await program.account.split.fetch(splitAddress);
        // console.log("splitAccount: ", splitAccount);

        const members = splitAccount.members as any[];
        printMemberInfo(members);
    });

    // try to withdraw, expect exception.
    // try to withdraw with non-member. expect exception.
    it("Withdraw my funds, and fail!", async () => {
        // Add your test here.
        await program.rpc.withdraw(splitBump, uuid, {
            accounts: {
                payer: myWallet.publicKey,
                split: splitAddress,
                systemProgram: SystemProgram.programId,
            },
            signers: [myWallet],
        });

        // verify treasury balance has not changed
        const splitAccountBalance =
            await program.provider.connection.getBalance(splitAddress);
        console.log("splitAccountBalance: ", splitAccountBalance);

        // fetch account and assert
        const splitAccount = await program.account.split.fetch(splitAddress);
        // console.log("splitAccount: ", splitAccount);

        const members = splitAccount.members as any[];
        printMemberInfo(members);
    });
});
