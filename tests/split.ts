import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import {
    PublicKey,
    SystemProgram,
    Keypair,
    LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import * as assert from "assert";

import { Split as SplitProgram } from "../target/types/split";
import { expectThrowsAsync, provideWallet, getSplitAccount, getUuid } from "./utils";

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

export const getMembers = async (address: PublicKey) => {
    const splitAccount = await program.account.split.fetch(address);
    return splitAccount.members as any[];
}

export const getMember = (members: any[], address: PublicKey) => {
    return members.filter(member => member.address.toString() === address.toString())[0];
}

export const isAccountDiscrepancyBelowThreshold = (
    expected: number,
    actual: number,
    // diff in SOL, at $200 / SOL = $0.002
    threshold = 0.00001
) => {
    const diff = (expected - actual) / LAMPORTS_PER_SOL;

    return diff < threshold;
}

describe("split", async () => {
    const uuid = getUuid();
    const [splitAddress, splitBump] = await getSplitAccount(uuid);
    const randomMember = Keypair.generate();

    it("Initialize split", async () => {
        await program.rpc.initialize(
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
        const members = splitAccount.members as any[];
        printMemberInfo(members);
    });

    it("Member attempts to withdraw their own funds when none allocated", async () => {
        expectThrowsAsync(async () => {
            await program.rpc.withdraw(splitBump, uuid, {
                accounts: {
                    payer: myWallet.publicKey,
                    member: myWallet.publicKey,
                    split: splitAddress,
                    systemProgram: SystemProgram.programId,
                },
                signers: [myWallet],
            });
        });

        const splitAccount = await program.account.split.fetch(splitAddress);
        const members = splitAccount.members as any[];
        printMemberInfo(members);
    });

    it("Allocate Member Funds!", async () => {
        const splitAccountBalanceBefore =
            await program.provider.connection.getBalance(splitAddress);
        const amountToAddToWallet = 1 * LAMPORTS_PER_SOL;

        const stateOfMembersBefore = await getMembers(splitAddress);

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
                    lamports: amountToAddToWallet,
                }),
            ],
            signers: [myWallet],
        });

        const splitAccountBalanceAfter =
            await program.provider.connection.getBalance(splitAddress);
        assert.ok(splitAccountBalanceAfter ===
            splitAccountBalanceBefore + amountToAddToWallet);

        const stateOfMembersAfter = await getMembers(splitAddress);
        printMemberInfo(stateOfMembersAfter);

        for (let i = 0; i < stateOfMembersAfter.length; i++) {
            const stateOfMemberBefore = stateOfMembersBefore[i];
            const memberShare = amountToAddToWallet * (stateOfMemberBefore.share.toNumber() / 100);

            assert.ok(stateOfMembersAfter[i].amount.toNumber() - stateOfMemberBefore.amount.toNumber()
                    === memberShare);
        }
    });

    it("Attempt withdraw for non-member", async () => {
        const randomEntity = Keypair.generate();

        expectThrowsAsync(async () => {
            await program.rpc.withdraw(splitBump, uuid, {
                accounts: {
                    payer: randomEntity.publicKey,
                    member: randomEntity.publicKey,
                    split: splitAddress,
                    systemProgram: SystemProgram.programId,
                },
                signers: [randomEntity],
            });
        });

        const splitAccount = await program.account.split.fetch(splitAddress);
        const members = splitAccount.members as any[];
        printMemberInfo(members);
    });

    it("Arbitrary user can initiate withdrawal for a member", async () => {
        const randomEntity = Keypair.generate();

        const splitAccountBalanceBefore =
            await program.provider.connection.getBalance(splitAddress);

        const stateOfMembersBefore = await getMembers(splitAddress);
        const memberAddress = myWallet.publicKey;
        const stateOfMemberBefore = getMember(stateOfMembersBefore, memberAddress);
        const memberAmount = stateOfMemberBefore.amount.toNumber();

        const memberBalanceBefore =
            await program.provider.connection.getBalance(memberAddress);

        await program.rpc.withdraw(splitBump, uuid, {
            accounts: {
                payer: randomEntity.publicKey,
                member: myWallet.publicKey,
                split: splitAddress,
                systemProgram: SystemProgram.programId,
            },
            signers: [randomEntity],
        });

        const splitAccountBalanceAfter =
            await program.provider.connection.getBalance(splitAddress);
        assert.ok(splitAccountBalanceBefore > splitAccountBalanceAfter);
        assert.ok(splitAccountBalanceBefore - splitAccountBalanceAfter === memberAmount);

        const stateOfMembersAfter = await getMembers(splitAddress);
        printMemberInfo(stateOfMembersAfter);

        const stateOfMemberAfter = getMember(stateOfMembersAfter, memberAddress);
        assert.ok(stateOfMemberAfter.amount.toNumber() === 0);

        const memberBalanceAfter =
            await program.provider.connection.getBalance(memberAddress);
        const balanceDiscrepancyIsAcceptable = isAccountDiscrepancyBelowThreshold(
            memberAmount,
            memberBalanceAfter - memberBalanceBefore
        );
        assert.ok(balanceDiscrepancyIsAcceptable);
    });

    it("Allocate member funds after random number of lamports added to account", async () => {
        const splitAccountBalanceBefore =
            await program.provider.connection.getBalance(splitAddress);
        const amountToAddToWallet = 12345683478;

        const stateOfMembersBefore = await getMembers(splitAddress);

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
                    lamports: amountToAddToWallet,
                }),
            ],
            signers: [myWallet],
        });

        const splitAccountBalanceAfter =
            await program.provider.connection.getBalance(splitAddress);
        assert.ok(splitAccountBalanceAfter ===
            splitAccountBalanceBefore + amountToAddToWallet);

        const amountOfFundsToAllocate = amountToAddToWallet - (amountToAddToWallet % 100);
        const stateOfMembersAfter = await getMembers(splitAddress);
        printMemberInfo(stateOfMembersAfter);

        for (let i = 0; i < stateOfMembersAfter.length; i++) {
            const stateOfMemberBefore = stateOfMembersBefore[i];
            const memberShare = amountOfFundsToAllocate * (stateOfMemberBefore.share.toNumber() / 100);

            assert.ok(stateOfMembersAfter[i].amount.toNumber() - stateOfMemberBefore.amount.toNumber()
                    === memberShare);
        }
    });

    it("Member withdraws their own funds", async () => {
        const splitAccountBalanceBefore =
            await program.provider.connection.getBalance(splitAddress);

        const member = myWallet;
        const stateOfMembersBefore = await getMembers(splitAddress);
        const stateOfMemberBefore = getMember(stateOfMembersBefore, member.publicKey);
        const memberAmount = stateOfMemberBefore.amount.toNumber();

        const memberBalanceBefore =
            await program.provider.connection.getBalance(member.publicKey);

        await program.rpc.withdraw(splitBump, uuid, {
            accounts: {
                payer: member.publicKey,
                member: member.publicKey,
                split: splitAddress,
                systemProgram: SystemProgram.programId,
            },
            signers: [myWallet],
        });

        const splitAccountBalanceAfter =
            await program.provider.connection.getBalance(splitAddress);
        assert.ok(splitAccountBalanceBefore > splitAccountBalanceAfter);
        assert.ok(splitAccountBalanceBefore - splitAccountBalanceAfter === memberAmount);

        const stateOfMembersAfter = await getMembers(splitAddress);
        printMemberInfo(stateOfMembersAfter);

        const stateOfMemberAfter = getMember(stateOfMembersAfter, member.publicKey);
        assert.ok(stateOfMemberAfter.amount.toNumber() === 0);

        const memberBalanceAfter =
            await program.provider.connection.getBalance(member.publicKey);
        const balanceDiscrepancyIsAcceptable = isAccountDiscrepancyBelowThreshold(
            memberAmount,
            memberBalanceAfter - memberBalanceBefore
        );
        assert.ok(balanceDiscrepancyIsAcceptable);
    });
});
