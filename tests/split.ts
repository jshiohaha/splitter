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
    getMembersList,
    getMemberBalances
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

        // even though we haven't allocated funds yet, the first check in the withdraw function
        // will prevent any further logic if payer != member in secure withdrawal scenario.
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

// todo: tighten tests and assertions
describe("composable split structure", async () => {
    const splits: any[] = [];

    const maxSplits = 3;
    const numMembersPerSplit = 2;
    for (let i = 0; i < maxSplits; i++) {
        const seed = getSeed();
        const [splitAddress, splitBump] = await getSplitAccount(seed);

        splits.push({
            'address': splitAddress,
            'bump': splitBump,
            'seed': seed,
            // for each member, store keypair & share?
            'members': Array.from(Array(numMembersPerSplit), (_i, _j) => Keypair.generate())
        });
    }

    it("Initialize most basic split tree", async () => {
        // split child 1
        const split1 = splits[0];
        const split1MemberData = getMembersList(split1.members);

        await program.rpc.initialize(
            split1.bump,
            split1.seed,
            false,
            split1MemberData,
            {
                accounts: {
                    payer: myWallet.publicKey,
                    split: split1.address,
                    systemProgram: SystemProgram.programId,
                },
                signers: [myWallet],
            }
        );

        // split child 2
        const split2 = splits[1];
        const split2MemberData = getMembersList(split2.members);

        await program.rpc.initialize(
            split2.bump,
            split2.seed,
            false,
            split2MemberData,
            {
                accounts: {
                    payer: myWallet.publicKey,
                    split: split2.address,
                    systemProgram: SystemProgram.programId,
                },
                signers: [myWallet],
            }
        );

        // split parent
        const split3 = splits[2];

        await program.rpc.initialize(
            split3.bump,
            split3.seed,
            false,
            [
                {
                    address: split1.address,
                    amount: new anchor.BN(0),
                    share: 50,
                },
                {
                    address: split2.address,
                    amount: new anchor.BN(0),
                    share: 50,
                }
            ],
            {
                accounts: {
                    payer: myWallet.publicKey,
                    split: split3.address,
                    systemProgram: SystemProgram.programId,
                },
                signers: [myWallet],
            }
        );

        const members = await getMembers(program, split3.address);
        printMemberInfo(members);
    });

    it("Allocate and force withdrawals for parent split", async () => {
        const split1 = splits[0];
        const split2 = splits[1];
        const split3 = splits[2];

        const fundsToAllocate = 1 * LAMPORTS_PER_SOL;

        // allocate funds in parent
        await program.rpc.allocateMemberFunds(split3.bump, split3.seed, {
            accounts: {
                payer: myWallet.publicKey,
                split: split3.address,
                systemProgram: SystemProgram.programId,
            },
            instructions: [
                SystemProgram.transfer({
                    fromPubkey: myWallet.publicKey,
                    toPubkey: split3.address,
                    lamports: fundsToAllocate,
                }),
            ],
            signers: [myWallet],
        });

        let members = await getMembers(program, split3.address);
        printMemberInfo(members);

        const split1BalanceBefore = await program.provider.connection.getBalance(split1.address);
        const split2BalanceBefore = await program.provider.connection.getBalance(split2.address);

        // crank withdrawals for parent members
        for (let i = 0; i < members.length; i++) {
            const member = members[i];

            await program.rpc.withdraw(split3.bump, split3.seed, {
                accounts: {
                    payer: myWallet.publicKey,
                    member: member.address,
                    split: split3.address,
                    systemProgram: SystemProgram.programId,
                },
                signers: [myWallet],
            });
        }

        members = await getMembers(program, split3.address);
        printMemberInfo(members);

        const approxSharePerChild = fundsToAllocate / members.length;

        const split1BalanceAfter = await program.provider.connection.getBalance(split1.address);
        const split2BalanceAfter = await program.provider.connection.getBalance(split2.address);

        // can be flaky depending on num children & percentage shares
        assert.ok(isAccountDiscrepancyBelowThreshold(
            split1BalanceAfter-split1BalanceBefore,
            approxSharePerChild
        ));

        assert.ok(isAccountDiscrepancyBelowThreshold(
            split2BalanceAfter-split2BalanceBefore,
            approxSharePerChild
        ));
    });

    it("Allocate and force withdrawals for 1 child splits", async () => {
        const split1 = splits[0];

        // allocate funds in child 1 split
        await program.rpc.allocateMemberFunds(split1.bump, split1.seed, {
            accounts: {
                payer: myWallet.publicKey,
                split: split1.address,
                systemProgram: SystemProgram.programId,
            },
            // don't allocate additional funds because we want to propagate funds from parent split
            signers: [myWallet],
        });

        let members = await getMembers(program, split1.address);
        printMemberInfo(members);

        const memberBalancesBefore = await getMemberBalances(program, members);

        // crank withdrawals for parent members
        for (let i = 0; i < members.length; i++) {
            const member = members[i];

            await program.rpc.withdraw(split1.bump, split1.seed, {
                accounts: {
                    payer: myWallet.publicKey,
                    member: member.address,
                    split: split1.address,
                    systemProgram: SystemProgram.programId,
                },
                signers: [myWallet],
            });
        }

        members = await getMembers(program, split1.address);
        printMemberInfo(members);

        // assert all member balances are zeroed out
        for (const member of members) {
            assert.ok(member.amount.toNumber() === 0);
        }

        // diff should be ~ equal to parent_split * (100 / num_members). e.g.
        // - 100 split m ways in parent split = 50/m to each child.
        // - 50/m in each child split n ways where n = num children.
        const memberBalancesAfter = await getMemberBalances(program, members);
        for (const address of Array.from(memberBalancesBefore.keys())) {
            // 1/4 SOL = LAMPORTS_PER_SOL / 4 = 250000000 lamports
            console.log('balance diff: ', memberBalancesAfter.get(address) - memberBalancesBefore.get(address));
        }
    });
});