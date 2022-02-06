import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { expect } from "chai";

// ============================================================================
// consts
// ============================================================================

export const SPLIT_SEED = "split";
export const SPLIT_INIT_SEED_LEN = 5;

// ============================================================================
// util functions
// ============================================================================

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

// prefer this instead of directly comparing account balances because tx fees can invalidate
// direct account balance checks. can be a little flaky depending on the threshold used —
// not sure if there's a more standard way of performing this check or not?
export const isAccountDiscrepancyBelowThreshold = (
    expected: number,
    actual: number,
    // diff in SOL, at $200 / SOL = $0.002
    threshold = 0.00001
) => {
    const diff = (expected - actual) / LAMPORTS_PER_SOL;
    return diff < threshold;
};

export const printMemberInfo = (members: any[]) => {
    console.log("===== MEMBER INFO =====");
    for (let i = 0; i < members.length; i++) {
        const member = members[i];
        console.log("Member : ", i + 1);
        console.log("address: ", member.address.toString());
        console.log("share: ", member.share);
        console.log("amount: ", member.amount.toNumber());
    }
    console.log();
};

export const getMemberBalances = async (client: any, members: any[]) => {
    const balances = new Map();
    for (const member of members) {
        const memberAddress = member.address;
        const balance = await client.getBalance(memberAddress);
        balances.set(memberAddress.toString(), balance);
    }

    return balances;
}