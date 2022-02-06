import * as anchor from "@project-serum/anchor";
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { assert } from "chai";

import { generateSeed, NodeWallet, SplitClient, Member } from "../../../sdk/src";

// ============================================================================
// base tester class
// ============================================================================

export class SplitTestClient extends SplitClient {
    nodeWallet: NodeWallet;

    seed!: string;
    splitAddress!: PublicKey;
    splitBump!: number;

    splitInitializeAuthority!: Keypair;
    members!: Member[];
    memberToKeypair!: Map<string, Keypair>;

    funder: Keypair;

    constructor() {
        // setup connection & local wallet
        super(
            anchor.Provider.env().connection,
            anchor.Provider.env().wallet as anchor.Wallet,
            true
        );

        this.nodeWallet = new NodeWallet(
            anchor.Provider.env().connection,
            anchor.Provider.env().wallet as anchor.Wallet
        );

        this.members = [];
        this.memberToKeypair = new Map();

        this.funder = this.nodeWallet.wallet.payer;
    }

    initializeSecureSplit = async () => {

    }

    // immutable?
    initializeSplit = async (
        numMembers: number = 1,
        initMembers?: Member[],
        secureWithdrawals?: boolean
    ) => {
        this.seed = generateSeed();
        [this.splitAddress, this.splitBump] = await this.findSplitPda(
            this.seed
        );

        this.members = initMembers
            ? initMembers
            : await this.generateMembers(numMembers);

        // for simplicity, assume some other entity always initializes split.
        // in real scenarios, a member can be authority.
        this.splitInitializeAuthority = await this.nodeWallet.createFundedWallet(0.1 * LAMPORTS_PER_SOL);

        await this.initialize(
            this.splitAddress,
            this.splitBump,
            this.seed,
            this.members,
            this.splitInitializeAuthority,
            secureWithdrawals
        );
    };

    withdrawMemberFundsWithNoAllocation = async () => {
        const members = await this.getMembers(this.splitAddress);
        const membersWithNoAllocation = members.filter(member => member.amount.toNumber() === 0);
        assert.ok(membersWithNoAllocation.length > 0, "All members have funds allocated");
        const member = membersWithNoAllocation[0]; 
        const keypair = await this.nodeWallet.createFundedWallet(0.1 * LAMPORTS_PER_SOL);

        await this.withdraw(
            this.splitAddress,
            this.splitBump,
            this.seed,
            member.address,
            keypair
        );
    };

    memberWithdrawsOwnFunds = async (
        member: PublicKey,
    ) => {
        const payer = this.memberToKeypair.get(
            member.toString()
        );

        await this.withdraw(
            this.splitAddress,
            this.splitBump,
            this.seed,
            member,
            payer
        );
    };

    randomEntityWithdrawForMember = async (
        member: PublicKey,
    ) => {
        const keypair = await this.nodeWallet.createFundedWallet(0.1 * LAMPORTS_PER_SOL);

        await this.withdraw(
            this.splitAddress,
            this.splitBump,
            this.seed,
            member,
            keypair
        );
    };

    withdrawFundsForAllMembers = async () => {
        const keypair = await this.nodeWallet.createFundedWallet(0.5 * LAMPORTS_PER_SOL);
        const members = await this.getMembers(this.splitAddress);

        for (const member of members) {
            // avoid withdrawals for members with 0 allocation
            if (member.amount.toNumber() > 0) {
                await this.withdraw(
                    this.splitAddress,
                    this.splitBump,
                    this.seed,
                    member.address,
                    keypair
                );
            }
        }
    };

    allocateMemberFunds = async () => {
        const keypair = await this.nodeWallet.createFundedWallet(0.1 * LAMPORTS_PER_SOL);

        await this.allocate(
            this.splitAddress,
            this.splitBump,
            this.seed,
            keypair
        );
    }

    closeSplit = async () => {
        await this.close(
            this.splitAddress,
            this.splitBump,
            this.seed,
            this.splitInitializeAuthority
        );
    }

    // ============================================================================
    // generic helpers
    // ============================================================================

    generateMembers = async (numMembers: number = 1): Promise<Member[]> => {
        const commonShare = Math.round(100 / numMembers);
        const leftOverShare = 100 - commonShare * numMembers;
        assert.ok(commonShare * numMembers + leftOverShare === 100);

        const members = [];
        for (let i = 0; i < numMembers; i++) {
            const memberKeypair = await this.nodeWallet.createFundedWallet(
                0.1 * LAMPORTS_PER_SOL
            );

            this.memberToKeypair.set(memberKeypair.publicKey.toString(), memberKeypair);

            members.push({
                address: memberKeypair.publicKey,
                amount: new anchor.BN(0),
                share:
                    i === numMembers - 1
                        ? commonShare + leftOverShare
                        : commonShare,
            });
        }

        return members;
    };

    addFundsToSplit = async (lamports: number): Promise<void> => {
        await this.nodeWallet.fundWallet(
            this.splitAddress,
            lamports
        );
    }
}
