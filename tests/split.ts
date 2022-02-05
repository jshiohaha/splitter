import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import {
    Keypair,
    SystemProgram,
    LAMPORTS_PER_SOL,
    Transaction,
    sendAndConfirmTransaction,
} from "@solana/web3.js";
import * as assert from "assert";

import { Split as SplitProgram } from "../target/types/split";
import {
    expectThrowsAsync,
    provideWallet,
    getSplitAccount,
    getSeed,
    isAccountDiscrepancyBelowThreshold,
    getMembers,
    getMember,
    printMemberInfo,
} from "./utils";

// Configure the client to use the local cluster.
const provider = anchor.Provider.env();
anchor.setProvider(provider);

const program = anchor.workspace.Split as Program<SplitProgram>;

// set env var on system before running tests.
// on osx, this is `export LOCAL_WALLET_PATH="REPLACE_WITH_PATH_TO_LOCAL_WALLET"
// this is something like /Users/myusername/.config/solana/id.json
const myWallet = provideWallet();

describe("default split lifetime", async () => {
    const seed = getSeed();
    const [splitAddress, splitBump] = await getSplitAccount(seed);
    const randomMember = Keypair.generate();

    it("Initialize split", async () => {
        await program.rpc.initialize(
            splitBump,
            seed,
            false,
            [
                {
                    address: myWallet.publicKey,
                    // we will ignore amount when initializing account
                    amount: new anchor.BN(0),
                    share: 40,
                },
                {
                    address: randomMember.publicKey,
                    amount: new anchor.BN(0),
                    share: 60,
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

        const members = await getMembers(program, splitAddress);
        printMemberInfo(members);
    });

    it("Member attempts to withdraw their own funds when none allocated", async () => {
        expectThrowsAsync(async () => {
            await program.rpc.withdraw(splitBump, seed, {
                accounts: {
                    payer: myWallet.publicKey,
                    member: myWallet.publicKey,
                    split: splitAddress,
                    systemProgram: SystemProgram.programId,
                },
                signers: [myWallet],
            });
        });

        const members = await getMembers(program, splitAddress);
        printMemberInfo(members);
    });

    it("Allocate Member Funds!", async () => {
        const splitAccountBalanceBefore =
            await program.provider.connection.getBalance(splitAddress);
        const amountToAddToWallet = 1 * LAMPORTS_PER_SOL;

        const stateOfMembersBefore = await getMembers(program, splitAddress);

        await program.rpc.allocateMemberFunds(splitBump, seed, {
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
        assert.ok(
            splitAccountBalanceAfter ===
                splitAccountBalanceBefore + amountToAddToWallet
        );

        const stateOfMembersAfter = await getMembers(program, splitAddress);
        printMemberInfo(stateOfMembersAfter);

        for (let i = 0; i < stateOfMembersAfter.length; i++) {
            const stateOfMemberBefore = stateOfMembersBefore[i];
            const memberShare =
                amountToAddToWallet * (stateOfMemberBefore.share / 100);

            assert.ok(
                stateOfMembersAfter[i].amount.toNumber() -
                    stateOfMemberBefore.amount.toNumber() ===
                    memberShare
            );
        }
    });

    it("Attempt withdraw for non-member", async () => {
        const randomEntity = Keypair.generate();

        expectThrowsAsync(async () => {
            await program.rpc.withdraw(splitBump, seed, {
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

        const stateOfMembersBefore = await getMembers(program, splitAddress);
        const memberAddress = myWallet.publicKey;
        const stateOfMemberBefore = getMember(
            stateOfMembersBefore,
            memberAddress
        );
        const memberAmount = stateOfMemberBefore.amount.toNumber();

        const memberBalanceBefore =
            await program.provider.connection.getBalance(memberAddress);

        await program.rpc.withdraw(splitBump, seed, {
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
        assert.ok(
            splitAccountBalanceBefore - splitAccountBalanceAfter ===
                memberAmount
        );

        const stateOfMembersAfter = await getMembers(program, splitAddress);
        printMemberInfo(stateOfMembersAfter);

        const stateOfMemberAfter = getMember(
            stateOfMembersAfter,
            memberAddress
        );
        assert.ok(stateOfMemberAfter.amount.toNumber() === 0);

        const memberBalanceAfter = await program.provider.connection.getBalance(
            memberAddress
        );
        const balanceDiscrepancyIsAcceptable =
            isAccountDiscrepancyBelowThreshold(
                memberAmount,
                memberBalanceAfter - memberBalanceBefore
            );
        assert.ok(balanceDiscrepancyIsAcceptable);
    });

    it("Allocate member funds after random number of lamports added to account", async () => {
        const splitAccountBalanceBefore =
            await program.provider.connection.getBalance(splitAddress);
        const amountToAddToWallet = 12345683478;

        const stateOfMembersBefore = await getMembers(program, splitAddress);

        await program.rpc.allocateMemberFunds(splitBump, seed, {
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
        assert.ok(
            splitAccountBalanceAfter ===
                splitAccountBalanceBefore + amountToAddToWallet
        );

        const amountOfFundsToAllocate =
            amountToAddToWallet - (amountToAddToWallet % 100);
        const stateOfMembersAfter = await getMembers(program, splitAddress);
        printMemberInfo(stateOfMembersAfter);

        for (let i = 0; i < stateOfMembersAfter.length; i++) {
            const stateOfMemberBefore = stateOfMembersBefore[i];
            const memberShare =
                amountOfFundsToAllocate * (stateOfMemberBefore.share / 100);

            assert.ok(
                stateOfMembersAfter[i].amount.toNumber() -
                    stateOfMemberBefore.amount.toNumber() ===
                    memberShare
            );
        }
    });

    it("Member withdraws their own funds", async () => {
        const splitAccountBalanceBefore =
            await program.provider.connection.getBalance(splitAddress);

        const member = myWallet;
        const stateOfMembersBefore = await getMembers(program, splitAddress);
        const stateOfMemberBefore = getMember(
            stateOfMembersBefore,
            member.publicKey
        );
        const memberAmount = stateOfMemberBefore.amount.toNumber();

        const memberBalanceBefore =
            await program.provider.connection.getBalance(member.publicKey);

        await program.rpc.withdraw(splitBump, seed, {
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
        assert.ok(
            splitAccountBalanceBefore - splitAccountBalanceAfter ===
                memberAmount
        );

        const stateOfMembersAfter = await getMembers(program, splitAddress);
        printMemberInfo(stateOfMembersAfter);

        const stateOfMemberAfter = getMember(
            stateOfMembersAfter,
            member.publicKey
        );
        assert.ok(stateOfMemberAfter.amount.toNumber() === 0);

        const memberBalanceAfter = await program.provider.connection.getBalance(
            member.publicKey
        );
        const balanceDiscrepancyIsAcceptable =
            isAccountDiscrepancyBelowThreshold(
                memberAmount,
                memberBalanceAfter - memberBalanceBefore
            );
        assert.ok(balanceDiscrepancyIsAcceptable);
    });

    it("Attempt to close account before all members have withdrawn their funds", async () => {
        expectThrowsAsync(async () => {
            await program.rpc.close(splitBump, seed, {
                accounts: {
                    payer: myWallet.publicKey,
                    split: splitAddress,
                    systemProgram: SystemProgram.programId,
                },
                signers: [myWallet],
            });
        });
    });

    it("Distribute all funds, initiated by random entity", async () => {
        const randomEntity = Keypair.generate();

        const splitAccountBalanceBefore =
            await program.provider.connection.getBalance(splitAddress);

        const stateOfMembersBefore = await getMembers(program, splitAddress);

        // airdrop some SOL to liquidator
        const airdropSignature =
            await program.provider.connection.requestAirdrop(
                randomEntity.publicKey,
                0.1 * LAMPORTS_PER_SOL
            );
        await program.provider.connection.confirmTransaction(airdropSignature);

        let memberAccountBalances = new Map();
        let totalAmountToWithdraw = 0;
        // compose tx with distribute ix for all members
        // https://solanacookbook.com/references/basic-transactions.html
        const txToExecute = new Transaction();
        for (let i = 0; i < stateOfMembersBefore.length; i++) {
            const member = stateOfMembersBefore[i];

            // make sure non-local wallets have some SOL
            if (member.address.toString() !== myWallet.publicKey.toString()) {
                const airdropSignature =
                    await program.provider.connection.requestAirdrop(
                        member.address,
                        0.1 * LAMPORTS_PER_SOL
                    );

                await program.provider.connection.confirmTransaction(
                    airdropSignature
                );
            }

            // collect account balances of all members before tx
            const memberBalance = await program.provider.connection.getBalance(
                member.address
            );
            memberAccountBalances.set(member.address.toString(), memberBalance);

            // ignore members that do not have any funds to withdraw
            if (member.amount.toNumber() > 0) {
                totalAmountToWithdraw += member.amount.toNumber();
                txToExecute.add(
                    await program.instruction.withdraw(splitBump, seed, {
                        accounts: {
                            payer: randomEntity.publicKey,
                            member: member.address,
                            split: splitAddress,
                            systemProgram: SystemProgram.programId,
                        },
                        signers: [randomEntity],
                    })
                );
            }
        }

        // // optionally uncomment to fail tx for unknown member
        // txToExecute.add(
        //     await program.instruction.withdraw(splitBump, seed, {
        //         accounts: {
        //             payer: randomEntity.publicKey,
        //             member: Keypair.generate().publicKey,
        //             split: splitAddress,
        //             systemProgram: SystemProgram.programId,
        //         },
        //         signers: [randomEntity],
        //     })
        // );

        await sendAndConfirmTransaction(
            program.provider.connection,
            txToExecute,
            [randomEntity]
        );

        const splitAccountBalanceAfter =
            await program.provider.connection.getBalance(splitAddress);

        const balanceDiscrepancyIsAcceptable =
            isAccountDiscrepancyBelowThreshold(
                splitAccountBalanceAfter,
                splitAccountBalanceBefore - totalAmountToWithdraw
            );
        assert.ok(balanceDiscrepancyIsAcceptable);

        const stateOfMembersAfter = await getMembers(program, splitAddress);
        printMemberInfo(stateOfMembersAfter);

        for (let i = 0; i < stateOfMembersAfter.length; i++) {
            const member = stateOfMembersAfter[i];
            // verify member accounts all increased by expected amount
            const memberAccountBalanceBeforeTx = memberAccountBalances.get(
                member.address.toString()
            );
            const memberAccountBalanceAfterTx =
                await program.provider.connection.getBalance(member.address);

            const balanceDiscrepancyIsAcceptable =
                isAccountDiscrepancyBelowThreshold(
                    memberAccountBalanceAfterTx,
                    memberAccountBalanceBeforeTx +
                        stateOfMembersBefore[i].amount.toNumber()
                );
            assert.ok(balanceDiscrepancyIsAcceptable);
            assert.ok(stateOfMembersAfter[i].amount.toNumber() === 0);
        }
    });

    it("Close split account after all members have withdrawn their funds", async () => {
        await program.rpc.close(splitBump, seed, {
            accounts: {
                payer: myWallet.publicKey,
                split: splitAddress,
                systemProgram: SystemProgram.programId,
            },
            signers: [myWallet],
        });

        const splitAccountBalanceAfter =
            await program.provider.connection.getBalance(splitAddress);
        assert.ok(splitAccountBalanceAfter === 0);
    });
});

describe("secure split lifetime", async () => {
    const seed = getSeed();
    const [splitAddress, splitBump] = await getSplitAccount(seed);
    const randomMember = Keypair.generate();

    it("Initialize split", async () => {
        await program.rpc.initialize(
            splitBump,
            seed,
            true, // secure withdrawals
            [
                {
                    address: myWallet.publicKey,
                    // we will ignore amount when initializing account
                    amount: new anchor.BN(0),
                    share: 30,
                },
                {
                    address: randomMember.publicKey,
                    amount: new anchor.BN(0),
                    share: 70,
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

        const members = await getMembers(program, splitAddress);
        printMemberInfo(members);
    });

    it("Arbitrary user is blocked from initiating withdrawal for a member", async () => {
        const randomEntity = Keypair.generate();

        expectThrowsAsync(async () => {
            await program.rpc.withdraw(splitBump, seed, {
                accounts: {
                    payer: randomEntity.publicKey,
                    member: myWallet.publicKey,
                    split: splitAddress,
                    systemProgram: SystemProgram.programId,
                },
                signers: [randomEntity],
            });
        }, "Member must withdraw their own funds");
    });

});