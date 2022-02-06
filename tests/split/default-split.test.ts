import {
    Keypair,
    LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import * as assert from "assert";

import { SplitTestClient } from './shared/driver.test';
import {
    expectThrowsAsync,
    isAccountDiscrepancyBelowThreshold,
    printMemberInfo,
} from "./shared/util";

describe("default split lifetime", async () => {
    let client = new SplitTestClient();

    it("Attempt to init without any members", async () => {
        expectThrowsAsync(async () => {
            await client.initializeSplit(0, []);
        }, "Must be initialized with at least 1 member");
    });

    it("Initialize split", async () => {
        await client.initializeSplit(2);

        const members = await client.getMembers(client.splitAddress);
        printMemberInfo(members);
    });

    it("Member attempts to withdraw their own funds when none allocated", async () => {
        await client.initializeSplit(2);

        expectThrowsAsync(async () => {
            await client.withdrawMemberFundsWithNoAllocation();
        });

        const members = await client.getMembers(client.splitAddress);
        printMemberInfo(members);
    });

    it("Allocate Member Funds!", async () => {
        await client.initializeSplit(2);

        const splitAccountBalanceBefore = await client.getBalance(client.splitAddress);
        const stateOfMembersBefore = await client.getMembers(client.splitAddress);
        const amountToAddToWallet = 1 * LAMPORTS_PER_SOL;

        await client.addFundsToSplit(amountToAddToWallet);
        await client.allocateMemberFunds();

        const splitAccountBalanceAfter = await client.getBalance(client.splitAddress);
        const stateOfMembersAfter = await client.getMembers(client.splitAddress);
        assert.ok(
            splitAccountBalanceAfter ===
                splitAccountBalanceBefore + amountToAddToWallet
        );
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
            client.randomEntityWithdrawForMember(randomEntity.publicKey);
        }, "Member with address does not exist");

        const members = await client.getMembers(client.splitAddress);
        printMemberInfo(members);
    });

    it("Arbitrary user can initiate withdrawal for a member", async () => {
        await client.initializeSplit(2);
        await client.addFundsToSplit(1 * LAMPORTS_PER_SOL);
        await client.allocateMemberFunds();

        const splitAccountBalanceBefore = await client.getBalance(client.splitAddress);
        const stateOfMembersBefore = await client.getMembers(client.splitAddress);

        // assume there is at least 1 member with non zero amount allocated to their address
        const memberWithAllocation = stateOfMembersBefore
            .filter(member => member.amount.toNumber() > 0)[0];
        const memberAmount = memberWithAllocation.amount.toNumber();
        const memberAddress = memberWithAllocation.address;
        const memberBalanceBefore = await client.getBalance(memberAddress);

        await client.randomEntityWithdrawForMember(memberAddress);

        const splitAccountBalanceAfter = await client.getBalance(client.splitAddress);
        assert.ok(splitAccountBalanceBefore > splitAccountBalanceAfter);
        assert.ok(
            splitAccountBalanceBefore - splitAccountBalanceAfter ===
                memberAmount
        );

        const stateOfMembersAfter = await client.getMembers(client.splitAddress);
        printMemberInfo(stateOfMembersAfter);
        const memberAllocationAfterWithdrawal = stateOfMembersAfter
            .filter(member => member.address.toString() === memberAddress.toString())
            .map(member => member.amount.toNumber())[0];
        assert.ok(memberAllocationAfterWithdrawal === 0);

        const memberBalanceAfter = await client.getBalance(memberAddress);
        assert.ok(memberBalanceAfter - memberBalanceBefore === memberAmount);
    });

    it("Allocate member funds after random number of lamports added to account", async () => {
        await client.initializeSplit(2);

        const splitAccountBalanceBefore = await client.getBalance(client.splitAddress);
        const stateOfMembersBefore = await client.getMembers(client.splitAddress);

        const amountToAddToWallet = 12345683478;
        await client.addFundsToSplit(amountToAddToWallet);
        await client.allocateMemberFunds();

        const splitAccountBalanceAfter = await client.getBalance(client.splitAddress);
        assert.ok(
            splitAccountBalanceAfter ===
                splitAccountBalanceBefore + amountToAddToWallet
        );
        const amountOfFundsToAllocate =
            amountToAddToWallet - (amountToAddToWallet % 100);

        const stateOfMembersAfter = await client.getMembers(client.splitAddress);
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
        await client.initializeSplit(2);

        const amountToAddToWallet = 12345683478;
        await client.addFundsToSplit(amountToAddToWallet);
        await client.allocateMemberFunds();

        const splitAccountBalanceBefore = await client.getBalance(client.splitAddress);
        const stateOfMembersBefore = await client.getMembers(client.splitAddress);

        // assume there is at least 1 member with non zero amount allocated to their address
        const memberWithAllocation = stateOfMembersBefore
            .filter(member => member.amount.toNumber() > 0)[0];
        console.log('memberWithAllocation: ', memberWithAllocation);
        const memberAmount = memberWithAllocation.amount.toNumber();
        const memberAddress = memberWithAllocation.address;
        const memberBalanceBefore = await client.getBalance(memberAddress);

        await client.memberWithdrawsOwnFunds(memberAddress);

        const splitAccountBalanceAfter = await client.getBalance(client.splitAddress);
        assert.ok(splitAccountBalanceBefore > splitAccountBalanceAfter);
        assert.ok(
            splitAccountBalanceBefore - splitAccountBalanceAfter ===
                memberAmount
        );

        const stateOfMembersAfter = await client.getMembers(client.splitAddress);
        printMemberInfo(stateOfMembersAfter);

        const memberAllocationAfterWithdrawal = stateOfMembersAfter
            .filter(member => member.address.toString() === memberAddress.toString())
            .map(member => member.amount.toNumber())[0];
        assert.ok(memberAllocationAfterWithdrawal === 0);

        const memberBalanceAfter = await client.getBalance(memberAddress);
        assert.ok(memberBalanceAfter - memberBalanceBefore === memberAmount);

        // test approx account difference because member personally paid for transaction,
        // so we need to deduct transaction fees.
        const balanceDiscrepancyIsAcceptable =
            isAccountDiscrepancyBelowThreshold(
                memberAmount,
                memberBalanceAfter - memberBalanceBefore
            );
        assert.ok(balanceDiscrepancyIsAcceptable);
    });

    it("Attempt to close account before all members have withdrawn their funds", async () => {
        await client.initializeSplit(2);
        await client.addFundsToSplit(1 * LAMPORTS_PER_SOL);
        await client.allocateMemberFunds();

        expectThrowsAsync(async () => {
            client.closeSplit();
        });
    });

    it("Distribute all funds, initiated by random entity", async () => {
        await client.initializeSplit(2);

        const amountToAddToWallet = 12345683478;
        await client.addFundsToSplit(amountToAddToWallet);
        await client.allocateMemberFunds();

        const splitAccountBalanceBefore = await client.getBalance(client.splitAddress);
        const stateOfMembersBefore = await client.getMembers(client.splitAddress);

        let memberAccountBalances = new Map();
        let totalAmountToWithdraw = 0;
        for (let i = 0; i < stateOfMembersBefore.length; i++) {
            const member = stateOfMembersBefore[i];
            // collect account balances of all members before tx
            const memberBalance = await client.getBalance(member.address);
            memberAccountBalances.set(member.address.toString(), memberBalance);
            totalAmountToWithdraw += member.amount.toNumber();
        }

        // perform withdrawals
        await client.withdrawFundsForAllMembers();

        const splitAccountBalanceAfter = await client.getBalance(client.splitAddress);

        const balanceDiscrepancyIsAcceptable =
            isAccountDiscrepancyBelowThreshold(
                splitAccountBalanceAfter,
                splitAccountBalanceBefore - totalAmountToWithdraw
            );
        assert.ok(balanceDiscrepancyIsAcceptable);

        const stateOfMembersAfter = await client.getMembers(client.splitAddress);
        printMemberInfo(stateOfMembersAfter);
        
        for (let i = 0; i < stateOfMembersAfter.length; i++) {
            const member = stateOfMembersAfter[i];
            // verify member accounts all increased by expected amount
            const memberAccountBalanceBeforeTx = memberAccountBalances.get(
                member.address.toString()
            );
            const memberAccountBalanceAfterTx = await client.getBalance(member.address);
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
        await client.initializeSplit(2);
        await client.addFundsToSplit(0.3 * LAMPORTS_PER_SOL);
        await client.allocateMemberFunds();
        await client.withdrawFundsForAllMembers();
        await client.closeSplit();

        // if account exists, validate balance is zero. otherwise, still succeed because this
        // means account could not be found.
        try {
            const splitAccountBalance = await client.getBalance(client.splitAddress);
            assert.ok(splitAccountBalance === 0);
        } catch (e: any) {
            // no-op
        }
    });
});
