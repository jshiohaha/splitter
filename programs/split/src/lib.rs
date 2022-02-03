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
pub const TOTAL_SHARE_PERCENTAGE: usize = 100;
pub const SPLIT_SEED: &str = "split";

// - create account with static initial accounts
// - withdraw endpoint: split account available amount among addresses
//      - p0: SOL withdrawals, p1: SPL token withdrawals
#[program]
pub mod split {
    use super::*;

    // note: to keep program simple, no updates to members or shares after init
    pub fn initialize(
        ctx: Context<Initialize>,
        bump: u8,
        uuid: String,
        members: Vec<Member>,
    ) -> ProgramResult {
        verify_members_share(&members)?;

        let split = &mut ctx.accounts.split;
        split.init(bump, uuid, members)?;

        Ok(())
    }

    pub fn allocate_member_funds(ctx: Context<AllocateFunds>, _bump: u8, _uuid: String, fail: bool) -> ProgramResult {
        let split_account_info = ctx.accounts.split.to_account_info();
        let available_funds = ctx.accounts.split.get_available_funds(
            split_account_info.lamports(),
            get_account_rent(split_account_info)?,
        )?;

        let withdrawable_total = compute_withdraw_amount(available_funds)?;
        msg!("amount to divide amongst members: {}", withdrawable_total);

        for member in &mut ctx.accounts.split.members {
            let member_share_percent = member.share;

            let member_share_amount = withdrawable_total
                .checked_mul(member_share_percent)
                .unwrap()
                .checked_div(TOTAL_SHARE_PERCENTAGE.try_into().unwrap())
                .unwrap();

            member.add_funds(member_share_amount);

            msg!(
                "member {} has share {} => {}. funds now at: {}",
                member.address,
                member_share_percent,
                member_share_amount,
                member.amount
            );
        }

        if fail {
            return Err(ErrorCode::NoRedeemableFunds.into());
        }

        Ok(())
    }

    // simplify by splitting withdraw into withdraw and allocate_shares
    pub fn withdraw(ctx: Context<Withdraw>, _bump: u8, _uuid: String) -> ProgramResult {
        // verify address of signer
        verify_member_exists(
            &ctx.accounts.split.members,
            ctx.accounts.payer.key(),
        )?;

        let member_idx = get_member_idx(&ctx.accounts.split.members, ctx.accounts.payer.key())?;
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
        // error message source: https://github.com/solana-labs/solana/blob/master/runtime/src/system_instruction_processor.rs#L189
        let split_account = &ctx.accounts.split.to_account_info();
        let amount_after_deduction: u64 = split_account
            .lamports()
            .checked_sub(member_withdrawal_amount)
            .ok_or(ErrorCode::InsufficientAccountBalance)?;
        **split_account.lamports.borrow_mut() = amount_after_deduction;

        // transfer member's share of lamports to their account
        let member = &ctx.accounts.payer;
        **member.lamports.borrow_mut() = member
            .lamports()
            .checked_add(member_withdrawal_amount)
            .ok_or(ErrorCode::NumericalOverflowError)?;

        Ok(())
    }

    // distribute remaining funds and close wallet account?
    // pub fn close(ctx: Context<Close>) -> ProgramResult {
    //     Ok(())
    // }
}

/// util functions
pub fn compute_withdraw_amount(amount: u64) -> result::Result<u64, ErrorCode> {
    let non_withdrawable_amount = amount
        .checked_rem(TOTAL_SHARE_PERCENTAGE.try_into().unwrap())
        .ok_or(ErrorCode::CheckedRemError)?;

    msg!("non_withdrawable_amount: {}", non_withdrawable_amount);

    let withdraw_amount = amount
        .checked_sub(non_withdrawable_amount)
        .ok_or(ErrorCode::NumericalUnderflowError)?;

    msg!("withdraw_amount: {}", withdraw_amount);

    Ok(withdraw_amount)
}

pub fn get_account_rent(account: AccountInfo) -> result::Result<u64, ProgramError> {
    let rent = Rent::get()?;
    let min_balance_for_rent = rent.minimum_balance(account.data_len());

    msg!("min_balance_for_rent: {}", min_balance_for_rent);

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
    uuid: String,
)]
pub struct Initialize<'info> {
    // payer is member who wants to withdraw their share of funds
    pub payer: Signer<'info>,
    #[account(init,
        seeds = [
            SPLIT_SEED.as_bytes(),
            uuid.as_bytes()
        ],
        bump = bump,
        payer = payer,
        space = 1000, // todo: compute spacing
        constraint = split.to_account_info().owner == program_id,
    )]
    pub split: Account<'info, Split>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(
    bump: u8,
    uuid: String,
    fail: bool
)]
// anyone can call this endpoint because it doesn't actually distribute funds.
// just allocates funds to members in the member vec.
pub struct AllocateFunds<'info> {
    pub payer: Signer<'info>,
    #[account(mut,
        seeds = [
            SPLIT_SEED.as_bytes(),
            uuid.as_bytes()
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
    uuid: String
)]
pub struct Withdraw<'info> {
    // payer is member who wants to withdraw their share of funds
    pub payer: Signer<'info>,
    #[account(mut,
        seeds = [
            SPLIT_SEED.as_bytes(),
            uuid.as_bytes()
        ],
        bump = bump,
        constraint = split.to_account_info().owner == program_id,
    )]
    pub split: Account<'info, Split>,
    pub system_program: Program<'info, System>,
}

// #[derive(Accounts)]
// pub struct Close<'info> {}

/// structs
#[repr(C)]
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, PartialEq, Debug)]
pub struct Member {
    // pubkey address of member
    pub address: Pubkey,
    // available amount to withdraw
    pub amount: u64,
    // percentage share of funds
    pub share: u64,
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
    // uuid with which Split account is initialized
    pub uuid: String,
    // timestamp at which wallet is initialized
    pub initialized_at: u64,
    // timestamp of last withdrawal
    pub last_withdrawal: u64,
    // entities that have claim rights to shared funds
    pub members: Vec<Member>,
}

impl Split {
    pub fn init(&mut self, bump: u8, uuid: String, members: Vec<Member>) -> ProgramResult {
        let clock = Clock::get()?;
        let current_timestamp = u64::try_from(clock.unix_timestamp).unwrap();

        self.bump = bump;
        self.uuid = uuid;
        self.initialized_at = current_timestamp;
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

    // ideally, i could convert &Split to AccountInfo here and then get rent & lamports.
    // presumably, this is possible. just couldn't figure out how to do it :(
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
    let total_member_share: u64 = members.iter().map(|member| member.share).sum();
    
    let valid_total_share = TOTAL_SHARE_PERCENTAGE.try_into().unwrap();
    if total_member_share != valid_total_share {
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
    #[msg("Cannot divide by zero!")]
    DivisionByZero,
    #[msg("No redeemable funds")]
    NoRedeemableFunds,
    #[msg("Member with address does not exist")]
    MemberWithAddressDoesNotExist,
    #[msg("Insufficient account balance")]
    InsufficientAccountBalance,
    #[msg("Total member share must be 100 percent")]
    InvalidMemberShare,
    #[msg("Checked REM error")]
    CheckedRemError,
    #[msg("Numerical overflow error")]
    NumericalOverflowError,
    #[msg("Numerical underflow error")]
    NumericalUnderflowError,
}
