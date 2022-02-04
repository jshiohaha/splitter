use {
    anchor_lang::prelude::*,
    solana_program::{
        msg,
        pubkey::Pubkey,
        sysvar::{clock::Clock, rent::Rent, Sysvar},
    },
    std::{
        convert::{TryFrom, TryInto},
        result,
    },
};

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

/// constants
pub const TOTAL_SHARE_PERCENTAGE: u8 = 100;
pub const SPLIT_SEED: &str = "split";

// - withdraw endpoint: split account available amount among addresses
//      - p0: SOL withdrawals
//      - p1: SPL token withdrawals? does this break composability?
#[program]
pub mod split {
    use super::*;

    // note: to keep program simple, no updates to members or shares after init
    pub fn initialize(
        ctx: Context<Initialize>,
        bump: u8,
        seed: String,
        members: Vec<Member>,
    ) -> ProgramResult {
        verify_members_share(&members)?;

        // quest: do we want to require initializer to be member?
        // i don't think so because this could affect composability.
        // need to think on this more. will revisit later.

        let split = &mut ctx.accounts.split;
        split.init(bump, seed, ctx.accounts.payer.key(), members)?;

        Ok(())
    }

    pub fn allocate_member_funds(ctx: Context<AllocateFunds>, _bump: u8, _uuid: String) -> ProgramResult {
        let split_account_info = ctx.accounts.split.to_account_info();
        let available_funds = ctx.accounts.split.get_available_funds(
            split_account_info.lamports(),
            get_account_rent(split_account_info)?,
        )?;

        let withdrawable_total = compute_withdraw_amount(available_funds)?;
        if withdrawable_total > 0 {
            for member in &mut ctx.accounts.split.members {
                let member_share_percent = member.share.try_into().unwrap();

                let member_share_amount = withdrawable_total
                    .checked_mul(member_share_percent)
                    .unwrap()
                    .checked_div(TOTAL_SHARE_PERCENTAGE.try_into().unwrap())
                    .unwrap();

                member.add_funds(member_share_amount);

                msg!(
                    "member {} // share {} // share in lamports {} // funds now at {}",
                    member.address,
                    member_share_percent,
                    member_share_amount,
                    member.amount
                );
            }
        }

        Ok(())
    }

    // simplify by splitting withdraw into withdraw and allocate_shares
    pub fn withdraw(ctx: Context<Withdraw>, _bump: u8, _uuid: String) -> ProgramResult {
        // verify address of signer
        verify_member_exists(
            &ctx.accounts.split.members,
            ctx.accounts.member.key(),
        )?;

        let member_idx = get_member_idx(&ctx.accounts.split.members, ctx.accounts.member.key())?;
        let member = &mut ctx.accounts.split.members[member_idx];
        let member_withdrawal_amount = member.amount;

        if member_withdrawal_amount == 0 {
            return Err(ErrorCode::NoRedeemableFunds.into());
        }

        member.reset_funds();
        &ctx.accounts.split.update_last_withdrawal()?;

        // since our auction PDA has data in it, we cannot use the system program to withdraw SOL.
        // otherwise, we will get an error message that says:
        //      >> Transfer: `from` must not carry data
        // source: https://github.com/solana-labs/solana/blob/master/runtime/src/system_instruction_processor.rs#L189
        let split_account = &ctx.accounts.split.to_account_info();
        let amount_after_deduction: u64 = split_account
            .lamports()
            .checked_sub(member_withdrawal_amount)
            .ok_or(ErrorCode::InsufficientAccountBalance)?;
        **split_account.lamports.borrow_mut() = amount_after_deduction;

        // transfer member's share of lamports to their account
        let member = &ctx.accounts.member;
        **member.lamports.borrow_mut() = member
            .lamports()
            .checked_add(member_withdrawal_amount)
            .ok_or(ErrorCode::NumericalOverflowError)?;

        Ok(())
    }

    // remove all lamports so that account can be garbage-collected next time rent is collected.
    pub fn close(
        ctx: Context<Close>,
        _bump: u8,
        _seed: String
    ) -> ProgramResult {
        // prevent account from being closed if all member funds have not been withddrawn.
        for member in &ctx.accounts.split.members {
            if member.amount != 0 {
                return Err(ErrorCode::MembersFundsHaveNotBeenWithdrawn.into());
            }
        }

        // transfer lamports from account to payer since we already verified
        // payer = initializer via anchor macro.
        let split_account = &ctx.accounts.split.to_account_info();
        let split_account_balance = split_account.lamports();
        **split_account.lamports.borrow_mut() = 0;

        // transfer member's share of lamports to their account
        let initializer = &ctx.accounts.payer;
        **initializer.lamports.borrow_mut() = initializer
            .lamports()
            .checked_add(split_account_balance)
            .ok_or(ErrorCode::NumericalOverflowError)?;

        Ok(())
    }
}

/// util functions
pub fn compute_withdraw_amount(amount: u64) -> result::Result<u64, ErrorCode> {
    let non_withdrawable_amount = amount
        .checked_rem(TOTAL_SHARE_PERCENTAGE.try_into().unwrap())
        .ok_or(ErrorCode::CheckedRemError)?;

    let withdraw_amount = amount
        .checked_sub(non_withdrawable_amount)
        .ok_or(ErrorCode::NumericalUnderflowError)?;

    Ok(withdraw_amount)
}

pub fn get_account_rent(account: AccountInfo) -> result::Result<u64, ProgramError> {
    let rent = Rent::get()?;
    let min_balance_for_rent = rent.minimum_balance(account.data_len());

    Ok(min_balance_for_rent)
}

pub fn get_member_idx(members: &Vec<Member>, target: Pubkey) -> result::Result<usize, ProgramError> {
    let member_idx = members
        .iter()
        .position(|member| member.address == target)
        .ok_or(ErrorCode::MemberWithAddressDoesNotExist)?;

    Ok(member_idx)
}

/// contexts
#[derive(Accounts)]
#[instruction(
    bump: u8,
    seed: String,
    members: Vec<Member>,
)]
pub struct Initialize<'info> {
    // payer is member who wants to withdraw their share of funds
    pub payer: Signer<'info>,
    #[account(init,
        seeds = [
            SPLIT_SEED.as_bytes(),
            seed.as_bytes()
        ],
        bump = bump,
        payer = payer,
        space = Initialize::space(seed.clone(), members.len()),
        constraint = split.to_account_info().owner == program_id,
    )]
    pub split: Account<'info, Split>,
    pub system_program: Program<'info, System>,
}

impl<'info> Initialize<'info> {
    // assuming a seed len of 5, and max account size = 10280, max number of members would be
    // (10280 - 73) / 41 = n = 248.9512195122.
    fn space(seed: String, num_members: usize) -> usize {
        return
            // discriminator
            8 +
            // bump
            1 +
            // seed
            4 + (8 * seed.len()) +
            // initialized_at
            8 +
            // last_withdrawal
            8 +
            // members
            4 + (num_members * (
                    // address
                    32 +
                    // amount
                    8 +
                    // share
                    1));
    }
}

#[derive(Accounts)]
#[instruction(
    bump: u8,
    seed: String,
)]
// anyone can call this endpoint because it doesn't actually distribute funds.
// just allocates funds to members in the member vec.
pub struct AllocateFunds<'info> {
    pub payer: Signer<'info>,
    #[account(mut,
        seeds = [
            SPLIT_SEED.as_bytes(),
            seed.as_bytes()
        ],
        bump = bump,
        constraint = split.to_account_info().owner == program_id,
    )]
    pub split: Account<'info, Split>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(
    bump: u8,
    seed: String
)]
pub struct Withdraw<'info> {
    // payer doesn't have to be member. although, i'm not sure there's an incentive for non-members
    // to initiate a withdraw.
    pub payer: Signer<'info>,
    // member address to which withdrawn funds will be sent
    #[account(mut)]
    pub member: AccountInfo<'info>,
    #[account(mut,
        seeds = [
            SPLIT_SEED.as_bytes(),
            seed.as_bytes()
        ],
        bump = bump,
        constraint = split.to_account_info().owner == program_id,
    )]
    pub split: Account<'info, Split>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(
    bump: u8,
    seed: String
)]
pub struct Close<'info> {
    // payer must be initializer. random entities should not be allowed
    // to close out the account.
    #[account(
        constraint = split.initializer.key() == payer.key(),
    )]
    pub payer: Signer<'info>,
    #[account(mut,
        seeds = [
            SPLIT_SEED.as_bytes(),
            seed.as_bytes()
        ],
        bump = bump,
        constraint = split.to_account_info().owner == program_id,
    )]
    pub split: Account<'info, Split>,
    pub system_program: Program<'info, System>,
}

/// structs
#[repr(C)]
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, PartialEq, Debug)]
pub struct Member {
    // pubkey address of member
    pub address: Pubkey,
    // available amount to withdraw
    pub amount: u64,
    // percentage share of funds
    pub share: u8,
}

impl Member {
    pub fn add_funds(&mut self, new_amount: u64) -> ProgramResult {
        self.amount = self.amount
            .checked_add(new_amount)
            .ok_or(ErrorCode::NumericalOverflowError)?;

        Ok(())
    }

    pub fn reset_funds(&mut self) -> ProgramResult {
        self.amount = 0;
        Ok(())
    }
}

#[account]
#[derive(Default)]
pub struct Split {
    pub bump: u8,
    // seed with which Split account is initialized
    pub seed: String,
    // timestamp at which wallet is initialized
    pub initialized_at: u64,
    // entity that intialized the account. we will use this
    // address to refund rent when closing this account.
    pub initializer: Pubkey,
    // timestamp of last withdrawal
    pub last_withdrawal: u64,
    // entities that have claim rights to shared funds
    pub members: Vec<Member>,
}

impl Split {
    pub fn init(&mut self, bump: u8, seed: String, initializer: Pubkey, members: Vec<Member>) -> ProgramResult {
        let clock = Clock::get()?;
        let current_timestamp = u64::try_from(clock.unix_timestamp).unwrap();

        self.bump = bump;
        self.seed = seed;
        self.initialized_at = current_timestamp;
        self.initializer = initializer;
        self.last_withdrawal = 0;

        self.members = Vec::new();
        for member in members {
            self.members.push(Member {
                address: member.address,
                share: member.share,
                amount: 0
            });
        }

        Ok(())
    }

    pub fn update_last_withdrawal(&mut self) -> ProgramResult {
        let clock = Clock::get()?;
        self.last_withdrawal = u64::try_from(clock.unix_timestamp).unwrap();

        Ok(())
    }

    // ideally, we would convert &Split to AccountInfo directly and then get rent & lamports.
    // presumably, this is possible. just couldn't figure out how to do it atm.
    pub fn get_available_funds(
        &self,
        lamports: u64,
        rent: u64,
    ) -> result::Result<u64, ProgramError> {
        let member_funds: u64 = self.members.iter().map(|member| member.amount).sum();

        let allocated_funds = member_funds
            .checked_add(rent)
            .ok_or(ErrorCode::NumericalOverflowError)?;

        let available_funds = lamports
            .checked_sub(allocated_funds)
            .ok_or(ErrorCode::NumericalUnderflowError)?;

        msg!(
            "rent {} // member_funds {} // allocated_funds {} // available_funds {}",
            rent,
            member_funds,
            allocated_funds,
            available_funds
        );

        Ok(available_funds)
    }
}

/// verify
pub fn verify_members_share(members: &Vec<Member>) -> ProgramResult {
    let total_member_share: u8 = members
        .iter()
        .map(|member| member.share)
        .sum();

    if total_member_share != TOTAL_SHARE_PERCENTAGE {
        return Err(ErrorCode::InvalidMemberShare.into());
    }

    Ok(())
}

pub fn verify_member_exists(members: &Vec<Member>, target: Pubkey) -> ProgramResult {
    let _member_idx = get_member_idx(members, target)?;

    Ok(())
}

/// errors
#[error]
pub enum ErrorCode {
    #[msg("No redeemable funds")]
    NoRedeemableFunds,
    #[msg("Member with address does not exist")]
    MemberWithAddressDoesNotExist,
    #[msg("Insufficient account balance")]
    InsufficientAccountBalance,
    #[msg("Please withdraw all member funds before taking this action")]
    MembersFundsHaveNotBeenWithdrawn,
    #[msg("Total member share must be 100 percent")]
    InvalidMemberShare,
    #[msg("Checked REM error")]
    CheckedRemError,
    #[msg("Numerical overflow error")]
    NumericalOverflowError,
    #[msg("Numerical underflow error")]
    NumericalUnderflowError,
}
