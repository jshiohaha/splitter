import * as anchor from "@project-serum/anchor";
import {
    LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import * as assert from "assert";

import { SplitTestClient } from './shared/driver.test';
import {
    isAccountDiscrepancyBelowThreshold,
    printMemberInfo,
    getMemberBalances
} from "./shared/util";

// todo: tighten tests and assertions; could be a lot more generic. base test class might also need some refactoring.
describe("composable split structure", async () => {
    let client1 = new SplitTestClient();
    let client2 = new SplitTestClient();
    let client3 = new SplitTestClient();

    const numMembersPerSplit = 2;

    it("Initialize most basic split tree", async () => {
        // split child 1
        const split1MemberData = await client1.generateMembers(numMembersPerSplit);
        await client1.initializeSplit(
            numMembersPerSplit,
            split1MemberData
        );

        const split2MemberData = await client2.generateMembers(numMembersPerSplit);
        await client2.initializeSplit(
            numMembersPerSplit,
            split2MemberData
        );

        // split parent
        const split3MemberData = [
            {
                address: client1.splitAddress,
                amount: new anchor.BN(0),
                share: 50,
            },
            {
                address: client2.splitAddress,
                amount: new anchor.BN(0),
                share: 50,
            }
        ];
        await client3.initializeSplit(
            numMembersPerSplit,
            split3MemberData
        );

        const members = await client3.getMembers(client3.splitAddress);
        printMemberInfo(members);
    });

    it("Allocate and force withdrawals for parent split", async () => {
        const fundsToAllocate = 1 * LAMPORTS_PER_SOL;

        // add and allocate funds in parent
        await client3.addFundsToSplit(fundsToAllocate);
        await client3.allocateMemberFunds();

        let members = await client3.getMembers(client3.splitAddress);
        printMemberInfo(members);

        const split1BalanceBefore = await client1.getBalance(client1.splitAddress);
        const split2BalanceBefore = await client2.getBalance(client2.splitAddress);

        // crank withdrawals for parent members
        for (let i = 0; i < members.length; i++) {
            await client3.randomEntityWithdrawForMember(members[i].address);
        }

        members = await client3.getMembers(client3.splitAddress);
        printMemberInfo(members);

        const approxSharePerChild = fundsToAllocate / members.length;
        const split1BalanceAfter = await client1.getBalance(client1.splitAddress);
        const split2BalanceAfter = await client2.getBalance(client2.splitAddress);

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
        // allocate funds in child 1 split
        // don't add additional funds because we want to propagate funds from parent split
        await client1.allocateMemberFunds();
        let members = await client1.getMembers(client1.splitAddress);
        printMemberInfo(members);

        const memberBalancesBefore = await getMemberBalances(client1, members);

        for (let i = 0; i < members.length; i++) {
            await client1.randomEntityWithdrawForMember(members[i].address);
        }
        members = await client1.getMembers(client1.splitAddress);
        printMemberInfo(members);

        // assert all member balances are zeroed out
        for (const member of members) {
            assert.ok(member.amount.toNumber() === 0);
        }

        // diff should be ~ equal to parent_split * (100 / num_members). e.g.
        // - 100 split m ways in parent split = 50/m to each child.
        // - 50/m in each child split n ways where n = num children.
        const memberBalancesAfter = await getMemberBalances(client1, members);
        for (const address of Array.from(memberBalancesBefore.keys())) {
            // 1/4 SOL = LAMPORTS_PER_SOL / 4 = 250000000 lamports
            console.log('balance diff: ', memberBalancesAfter.get(address) - memberBalancesBefore.get(address));
        }
    });
});
