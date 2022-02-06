import * as anchor from "@project-serum/anchor";
import { Idl, Program, Provider, Wallet } from "@project-serum/anchor";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";

import { Split as SplitProgram } from "./types/split";
import { AccountUtils } from "./common/account-utils";
import { SPLIT_SEED, isKp } from "./common";

export interface Member {
    address: PublicKey;
    amount: anchor.BN;
    share: number;
}

export class SplitClient extends AccountUtils {
    wallet: anchor.Wallet;
    provider: anchor.Provider;
    splitProgram: anchor.Program<SplitProgram>;

    isVerbose: boolean;

    constructor(
        connection: Connection,
        wallet: Wallet,
        isVerbose?: boolean,
        idl?: Idl,
        programId?: PublicKey
    ) {
        super(connection);
        this.wallet = wallet;
        this.setProvider();
        this.setSplitProgram(idl, programId);

        this.isVerbose = isVerbose ? isVerbose : false;
    }

    setProvider = () => {
        this.provider = new Provider(
            this.connection,
            this.wallet,
            Provider.defaultOptions()
        );
        anchor.setProvider(this.provider);
    };

    setSplitProgram = (idl?: Idl, programId?: PublicKey) => {
        // instantiating program depends on the environment
        if (idl && programId) {
            // prod env
            this.splitProgram = new anchor.Program<SplitProgram>(
                idl as any,
                programId,
                this.provider
            );
        } else {
            // test env
            this.splitProgram = anchor.workspace.Split as Program<SplitProgram>;
        }
    };

    // ============================================================================
    // fetch deserialized accounts
    // ============================================================================

    fetchSplit = async (split: PublicKey) => {
        return this.splitProgram.account.split.fetch(split);
    };

    // ============================================================================
    // find PDA accounts
    // ============================================================================

    async findSplitPda(seed: string) {
        return this.findProgramAddress(this.splitProgram.programId, [
            SPLIT_SEED,
            seed,
        ]);
    }

    //  // --------------------------------------- get all PDAs by type
    //  //https://project-serum.github.io/anchor/ts/classes/accountclient.html#all
    //   async fetchAllSplitPdas(uuid?: string) {
    //     const filter = uuid
    //       ? [
    //           {
    //             memcmp: {
    //               offset: 10, //need to prepend 8 bytes for anchor's disc
    //               bytes: Buffer.from(uuid)
    //             },
    //           },
    //         ]
    //       : [];
    //     const pdas = await this.splitProgram.account.split.all(filter);
    //     console.log(`found a total of ${pdas.length} split PDAs`);
    //     return pdas;
    //   }

    // ============================================================================
    // execute program txs
    // ============================================================================

    initialize = async (
        split: PublicKey,
        bump: number,
        seed: string,
        members: Member[],
        payer: PublicKey | Keypair,
        secureWithdrawal?: boolean
    ) => {
        const payerIsKeypair = isKp(payer);
        const _payer = payerIsKeypair ? (<Keypair>payer).publicKey : payer;

        // assert signers is non-empty array?
        const signers = [];
        if (payerIsKeypair) signers.push(<Keypair>payer);

        // if (this.isVerbose) {
        //     console.log(
        //         `calling initialize split with address ${split.toString()}. payer: ${_payer.toString()} and ${
        //             signers.length
        //         } signers`
        //     );
        // }

        await this.splitProgram.rpc.initialize(
            bump,
            seed,
            secureWithdrawal ? secureWithdrawal : false,
            members,
            {
                accounts: {
                    payer: _payer,
                    split,
                    systemProgram: SystemProgram.programId,
                },
                signers,
            }
        );
    };

    // in tests, fund split before trying to allocate funds.
    allocate = async (
        split: PublicKey,
        bump: number,
        seed: string,
        payer: PublicKey | Keypair
    ) => {
        const signers = [];
        if (isKp(payer)) signers.push(<Keypair>payer);

        await this.splitProgram.rpc.allocateMemberFunds(bump, seed, {
            accounts: {
                payer: isKp(payer) ? (<Keypair>payer).publicKey : payer,
                split,
                systemProgram: SystemProgram.programId,
            },
            signers,
        });
    };

    withdraw = async (
        split: PublicKey,
        bump: number,
        seed: string,
        member: PublicKey,
        payer: PublicKey | Keypair
    ) => {
        const payerIsKeypair = isKp(payer);
        const _payer = payerIsKeypair ? (<Keypair>payer).publicKey : payer;

        const signers = [];
        if (isKp(payer)) signers.push(<Keypair>payer);

        if (this.isVerbose) {
            console.log(
                `closing split with authority ${split.toString()}. payer: ${_payer.toString()} and ${
                    signers.length
                } signers`
            );
        }

        await this.splitProgram.rpc.withdraw(bump, seed, {
            accounts: {
                payer: _payer,
                member: member,
                split,
                systemProgram: SystemProgram.programId,
            },
            signers,
        });
    };

    close = async (
        split: PublicKey,
        bump: number,
        seed: string,
        payer: PublicKey | Keypair
    ) => {
        const payerIsKeypair = isKp(payer);
        const _payer = payerIsKeypair ? (<Keypair>payer).publicKey : payer;

        const signers = [];
        if (isKp(payer)) signers.push(<Keypair>payer);

        if (this.isVerbose) {
            console.log(
                `closing split with authority ${split.toString()}. payer: ${_payer.toString()} and ${
                    signers.length
                } signers`
            );
        }

        await this.splitProgram.rpc.close(bump, seed, {
            accounts: {
                payer: isKp(payer) ? (<Keypair>payer).publicKey : payer,
                split,
                systemProgram: SystemProgram.programId,
            },
            signers,
        });
    };

    // ============================================================================
    // program data getters
    // ============================================================================

    getMembers = async (address: PublicKey): Promise<Member[]> => {
        return (await this.fetchSplit(address)).members as Member[];
    };
}
