use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hash as sha256;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};
use anchor_spl::associated_token::AssociatedToken;
use inco_lightning::cpi::accounts::{Allow, Operation};
use inco_lightning::cpi::{allow, as_euint128, e_add, e_ge, e_select, e_sub, new_euint128};
use inco_lightning::types::{Ebool, Euint128};
use inco_lightning::ID as INCO_LIGHTNING_ID;

declare_id!("FVwSkmgzT1yvgJ1eWpfyXnaRnD86xfUKtBFHBLFfXkRb");

#[program]
pub mod veilpay {
    use super::*;

    /// Initialize a new confidential treasury vault with a token mint.
    pub fn initialize_vault<'info>(
        ctx: Context<'_, '_, 'info, 'info, InitializeVault<'info>>,
        auditor: Pubkey,
        spending_limit_ciphertext: Vec<u8>,
        input_type: u8,
    ) -> Result<()> {
        let vault = &mut ctx.accounts.vault_config;
        let inco = ctx.accounts.inco_lightning_program.to_account_info();
        let signer = ctx.accounts.authority.to_account_info();
        let sys = ctx.accounts.system_program.to_account_info();

        vault.authority = ctx.accounts.authority.key();
        vault.auditor = auditor;
        vault.token_mint = ctx.accounts.token_mint.key();
        vault.is_frozen = false;
        vault.bump = ctx.bumps.vault_config;
        vault.current_epoch = Clock::get()?.epoch;
        vault.payment_nonce = 0;

        let cpi_ctx = CpiContext::new(inco.clone(), Operation { signer: signer.clone() });
        vault.encrypted_balance = as_euint128(cpi_ctx, 0)?;

        let cpi_ctx = CpiContext::new(inco.clone(), Operation { signer: signer.clone() });
        vault.encrypted_spending_limit = new_euint128(cpi_ctx, spending_limit_ciphertext, input_type)?;

        let cpi_ctx = CpiContext::new(inco.clone(), Operation { signer: signer.clone() });
        vault.encrypted_spent_this_epoch = as_euint128(cpi_ctx, 0)?;

        // Grant decrypt access if remaining_accounts provided
        let ra = &ctx.remaining_accounts;
        if ra.len() >= 12 {
            let handles = [vault.encrypted_balance, vault.encrypted_spending_limit, vault.encrypted_spent_this_epoch];
            let addrs = [vault.authority, vault.auditor];
            for (hi, h) in handles.iter().enumerate() {
                for (ai, a) in addrs.iter().enumerate() {
                    let base = hi * 4 + ai * 2;
                    let cpi_ctx = CpiContext::new(inco.clone(), Allow {
                        allowance_account: ra[base].clone(),
                        signer: signer.clone(),
                        allowed_address: ra[base + 1].clone(),
                        system_program: sys.clone(),
                    });
                    allow(cpi_ctx, h.0, true, *a)?;
                }
            }
        }

        emit!(VaultInitialized { vault: vault.key(), authority: vault.authority, auditor: vault.auditor, token_mint: vault.token_mint });
        Ok(())
    }

    pub fn add_to_whitelist(ctx: Context<AddToWhitelist>, wallet: Pubkey, role: u8) -> Result<()> {
        require!(role <= 2, VeilPayError::InsufficientRole);
        let wl = &mut ctx.accounts.whitelist;
        wl.vault = ctx.accounts.vault_config.key();
        wl.wallet = wallet;
        wl.is_active = true;
        wl.role = role;
        wl.bump = ctx.bumps.whitelist;
        Ok(())
    }

    pub fn remove_from_whitelist(_ctx: Context<RemoveFromWhitelist>) -> Result<()> {
        Ok(())
    }

    /// Deposit: transfers SPL tokens from depositor to vault, then updates encrypted balance.
    pub fn deposit<'info>(ctx: Context<'_, '_, 'info, 'info, Deposit<'info>>, ciphertext: Vec<u8>, input_type: u8, amount: u64) -> Result<()> {
        let vault = &mut ctx.accounts.vault_config;
        require!(!vault.is_frozen, VeilPayError::VaultFrozen);
        require!(ctx.accounts.whitelist.is_active, VeilPayError::NotWhitelisted);

        // Transfer SPL tokens from depositor to vault token account
        let decimals = ctx.accounts.token_mint.decimals;
        let transfer_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.depositor_token_account.to_account_info(),
                mint: ctx.accounts.token_mint.to_account_info(),
                to: ctx.accounts.vault_token_account.to_account_info(),
                authority: ctx.accounts.depositor.to_account_info(),
            },
        );
        token_interface::transfer_checked(transfer_ctx, amount, decimals)?;

        // TEE: encrypt the amount and add to encrypted balance
        let inco = ctx.accounts.inco_lightning_program.to_account_info();
        let signer = ctx.accounts.depositor.to_account_info();
        let sys = ctx.accounts.system_program.to_account_info();

        let cpi_ctx = CpiContext::new(inco.clone(), Operation { signer: signer.clone() });
        let encrypted_amount = new_euint128(cpi_ctx, ciphertext, input_type)?;

        let cpi_ctx = CpiContext::new(inco.clone(), Operation { signer: signer.clone() });
        vault.encrypted_balance = e_add(cpi_ctx, vault.encrypted_balance, encrypted_amount, 0)?;

        let ra = &ctx.remaining_accounts;
        if ra.len() >= 4 {
            let addrs = [vault.authority, vault.auditor];
            for (i, a) in addrs.iter().enumerate() {
                let cpi_ctx = CpiContext::new(inco.clone(), Allow {
                    allowance_account: ra[i * 2].clone(),
                    signer: signer.clone(),
                    allowed_address: ra[i * 2 + 1].clone(),
                    system_program: sys.clone(),
                });
                allow(cpi_ctx, vault.encrypted_balance.0, true, *a)?;
            }
        }

        emit!(ConfidentialDeposit { vault: vault.key(), depositor: ctx.accounts.depositor.key(), amount, timestamp: Clock::get()?.unix_timestamp });
        Ok(())
    }

    /// Confidential transfer: only updates encrypted state. No token movement.
    /// Tokens stay pooled in the vault. Recipient claims via claim_payment.
    pub fn confidential_transfer<'info>(ctx: Context<'_, '_, 'info, 'info, ConfidentialTransfer<'info>>, amount_ciphertext: Vec<u8>, input_type: u8, amount: u64) -> Result<()> {
        let vault = &mut ctx.accounts.vault_config;
        require!(!vault.is_frozen, VeilPayError::VaultFrozen);
        let whitelist = &ctx.accounts.whitelist;
        require!(whitelist.is_active, VeilPayError::NotWhitelisted);
        require!(whitelist.role >= 1, VeilPayError::InsufficientRole);

        let inco = ctx.accounts.inco_lightning_program.to_account_info();
        let signer = ctx.accounts.sender.to_account_info();
        let sys = ctx.accounts.system_program.to_account_info();

        let cpi_ctx = CpiContext::new(inco.clone(), Operation { signer: signer.clone() });
        let encrypted_amount = new_euint128(cpi_ctx, amount_ciphertext, input_type)?;

        let current_epoch = Clock::get()?.epoch;
        if current_epoch > vault.current_epoch {
            let cpi_ctx = CpiContext::new(inco.clone(), Operation { signer: signer.clone() });
            vault.encrypted_spent_this_epoch = as_euint128(cpi_ctx, 0)?;
            vault.current_epoch = current_epoch;
        }

        let cpi_ctx = CpiContext::new(inco.clone(), Operation { signer: signer.clone() });
        let new_spent = e_add(cpi_ctx, vault.encrypted_spent_this_epoch, encrypted_amount, 0)?;

        let cpi_ctx = CpiContext::new(inco.clone(), Operation { signer: signer.clone() });
        let is_within_limit: Ebool = e_ge(cpi_ctx, vault.encrypted_spending_limit, new_spent, 0)?;

        let cpi_ctx = CpiContext::new(inco.clone(), Operation { signer: signer.clone() });
        let zero = as_euint128(cpi_ctx, 0)?;

        let cpi_ctx = CpiContext::new(inco.clone(), Operation { signer: signer.clone() });
        let actual_amount = e_select(cpi_ctx, is_within_limit, encrypted_amount, zero, 0)?;

        let cpi_ctx = CpiContext::new(inco.clone(), Operation { signer: signer.clone() });
        let actual_new_spent = e_select(cpi_ctx, is_within_limit, new_spent, vault.encrypted_spent_this_epoch, 0)?;

        let cpi_ctx = CpiContext::new(inco.clone(), Operation { signer: signer.clone() });
        vault.encrypted_balance = e_sub(cpi_ctx, vault.encrypted_balance, actual_amount, 0)?;
        vault.encrypted_spent_this_epoch = actual_new_spent;

        let nonce = vault.payment_nonce;
        vault.payment_nonce = vault.payment_nonce.checked_add(1).unwrap();

        // No token transfer — only encrypted state updated.
        // Tokens stay pooled in vault. Authority settles via settle_payment.

        let payment = &mut ctx.accounts.payment_record;
        payment.vault = vault.key();
        payment.sender = ctx.accounts.sender.key();
        payment.recipient = ctx.accounts.recipient.key();
        payment.encrypted_amount = actual_amount;
        payment.timestamp = Clock::get()?.unix_timestamp;
        payment.nonce = nonce;
        payment.bump = ctx.bumps.payment_record;
        payment.is_settled = false;
        // Store hash of (recipient + amount + nonce) for claim verification
        let mut hash_input = Vec::with_capacity(48);
        hash_input.extend_from_slice(ctx.accounts.recipient.key.as_ref());
        hash_input.extend_from_slice(&amount.to_le_bytes());
        hash_input.extend_from_slice(&nonce.to_le_bytes());
        payment.amount_hash = sha256(&hash_input).to_bytes();

        let ra = &ctx.remaining_accounts;
        if ra.len() >= 8 {
            let handles = [vault.encrypted_balance, vault.encrypted_spent_this_epoch];
            let addrs = [vault.authority, vault.auditor];
            for (hi, h) in handles.iter().enumerate() {
                for (ai, a) in addrs.iter().enumerate() {
                    let base = hi * 4 + ai * 2;
                    let cpi_ctx = CpiContext::new(inco.clone(), Allow {
                        allowance_account: ra[base].clone(),
                        signer: ctx.accounts.sender.to_account_info(),
                        allowed_address: ra[base + 1].clone(),
                        system_program: sys.clone(),
                    });
                    allow(cpi_ctx, h.0, true, *a)?;
                }
            }
        }

        emit!(ConfidentialTransferEvent { vault: vault.key(), sender: payment.sender, recipient: payment.recipient, nonce, timestamp: payment.timestamp });
        Ok(())
    }

    /// Claim payment: Recipient withdraws tokens by proving they know the correct amount.
    /// The program verifies hash(recipient + amount + nonce) matches the stored hash.
    pub fn claim_payment(ctx: Context<ClaimPayment>, amount: u64) -> Result<()> {
        let payment = &mut ctx.accounts.payment_record;
        require!(!payment.is_settled, VeilPayError::AlreadySettled);

        // Verify the claim amount matches the hash stored during transfer
        let mut hash_input = Vec::with_capacity(48);
        hash_input.extend_from_slice(ctx.accounts.recipient.key.as_ref());
        hash_input.extend_from_slice(&amount.to_le_bytes());
        hash_input.extend_from_slice(&payment.nonce.to_le_bytes());
        let computed_hash = sha256(&hash_input).to_bytes();
        require!(computed_hash == payment.amount_hash, VeilPayError::InvalidClaimAmount);

        let authority_key = ctx.accounts.vault_config.authority;
        let bump = ctx.accounts.vault_config.bump;
        let vault_account_info = ctx.accounts.vault_config.to_account_info();

        // Transfer real SPL tokens from vault to recipient
        let decimals = ctx.accounts.token_mint.decimals;
        let seeds: &[&[u8]] = &[b"vault_v2", authority_key.as_ref(), &[bump]];
        let signer_seeds = &[seeds];

        let transfer_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.vault_token_account.to_account_info(),
                mint: ctx.accounts.token_mint.to_account_info(),
                to: ctx.accounts.recipient_token_account.to_account_info(),
                authority: vault_account_info,
            },
            signer_seeds,
        );
        token_interface::transfer_checked(transfer_ctx, amount, decimals)?;

        payment.is_settled = true;

        emit!(PaymentSettled { vault: payment.vault, recipient: payment.recipient, nonce: payment.nonce, amount });
        Ok(())
    }

    /// Close the vault and return all rent + remaining tokens to authority.
    pub fn close_vault(ctx: Context<CloseVault>) -> Result<()> {
        // Transfer any remaining SPL tokens back to authority
        let authority_key = ctx.accounts.vault_config.authority;
        let bump = ctx.accounts.vault_config.bump;
        let vault_account_info = ctx.accounts.vault_config.to_account_info();

        let token_balance = ctx.accounts.vault_token_account.amount;
        if token_balance > 0 {
            let decimals = ctx.accounts.token_mint.decimals;
            let seeds: &[&[u8]] = &[b"vault_v2", authority_key.as_ref(), &[bump]];
            let signer_seeds = &[seeds];

            let transfer_ctx = CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.vault_token_account.to_account_info(),
                    mint: ctx.accounts.token_mint.to_account_info(),
                    to: ctx.accounts.authority_token_account.to_account_info(),
                    authority: vault_account_info,
                },
                signer_seeds,
            );
            token_interface::transfer_checked(transfer_ctx, token_balance, decimals)?;
        }

        // vault_config account is closed via `close = authority` in the accounts struct
        Ok(())
    }

    pub fn freeze_vault(ctx: Context<FreezeVault>) -> Result<()> {
        ctx.accounts.vault_config.is_frozen = true;
        emit!(VaultFrozen { vault: ctx.accounts.vault_config.key(), frozen_by: ctx.accounts.authority.key() });
        Ok(())
    }

    pub fn unfreeze_vault(ctx: Context<UnfreezeVault>) -> Result<()> {
        ctx.accounts.vault_config.is_frozen = false;
        Ok(())
    }

    /// Grant decrypt access for all vault handles to authority and auditor.
    /// Can be called anytime after vault creation to fix missing allow() permissions.
    pub fn grant_decrypt_access<'info>(ctx: Context<'_, '_, 'info, 'info, GrantDecryptAccess<'info>>) -> Result<()> {
        let vault = &ctx.accounts.vault_config;
        let inco = ctx.accounts.inco_lightning_program.to_account_info();
        let signer = ctx.accounts.authority.to_account_info();
        let sys = ctx.accounts.system_program.to_account_info();

        let handles = [vault.encrypted_balance, vault.encrypted_spending_limit, vault.encrypted_spent_this_epoch];
        let addrs = [vault.authority, vault.auditor];
        let ra = &ctx.remaining_accounts;
        require!(ra.len() >= 12, VeilPayError::InsufficientAccounts);

        for (hi, h) in handles.iter().enumerate() {
            for (ai, a) in addrs.iter().enumerate() {
                let base = hi * 4 + ai * 2;
                let cpi_ctx = CpiContext::new(inco.clone(), Allow {
                    allowance_account: ra[base].clone(),
                    signer: signer.clone(),
                    allowed_address: ra[base + 1].clone(),
                    system_program: sys.clone(),
                });
                allow(cpi_ctx, h.0, true, *a)?;
            }
        }

        Ok(())
    }

    /// Grant decrypt access for a payment record's encrypted amount.
    pub fn grant_payment_access<'info>(ctx: Context<'_, '_, 'info, 'info, GrantPaymentAccess<'info>>) -> Result<()> {
        let vault = &ctx.accounts.vault_config;
        let payment = &ctx.accounts.payment_record;
        let inco = ctx.accounts.inco_lightning_program.to_account_info();
        let signer = ctx.accounts.authority.to_account_info();
        let sys = ctx.accounts.system_program.to_account_info();

        let addrs = [vault.authority, vault.auditor];
        let ra = &ctx.remaining_accounts;
        require!(ra.len() >= 4, VeilPayError::InsufficientAccounts);

        for (ai, a) in addrs.iter().enumerate() {
            let base = ai * 2;
            let cpi_ctx = CpiContext::new(inco.clone(), Allow {
                allowance_account: ra[base].clone(),
                signer: signer.clone(),
                allowed_address: ra[base + 1].clone(),
                system_program: sys.clone(),
            });
            allow(cpi_ctx, payment.encrypted_amount.0, true, *a)?;
        }

        Ok(())
    }

    pub fn reset_epoch(ctx: Context<ResetEpoch>) -> Result<()> {
        let vault = &mut ctx.accounts.vault_config;
        let current_epoch = Clock::get()?.epoch;
        if current_epoch > vault.current_epoch {
            let inco = ctx.accounts.inco_lightning_program.to_account_info();
            let signer = ctx.accounts.payer.to_account_info();
            let cpi_ctx = CpiContext::new(inco, Operation { signer });
            vault.encrypted_spent_this_epoch = as_euint128(cpi_ctx, 0)?;
            vault.current_epoch = current_epoch;
        }
        Ok(())
    }
}

// ============================================================
// ACCOUNTS
// ============================================================

#[account]
pub struct VaultConfig {
    pub authority: Pubkey,
    pub auditor: Pubkey,
    pub token_mint: Pubkey,
    pub encrypted_balance: Euint128,
    pub encrypted_spending_limit: Euint128,
    pub encrypted_spent_this_epoch: Euint128,
    pub current_epoch: u64,
    pub payment_nonce: u64,
    pub is_frozen: bool,
    pub bump: u8,
}
impl VaultConfig { pub const LEN: usize = 8 + 32 + 32 + 32 + 16 + 16 + 16 + 8 + 8 + 1 + 1 + 64; }

#[account]
pub struct Whitelist {
    pub vault: Pubkey,
    pub wallet: Pubkey,
    pub is_active: bool,
    pub role: u8,
    pub bump: u8,
}
impl Whitelist { pub const LEN: usize = 8 + 32 + 32 + 1 + 1 + 1 + 32; }

#[account]
pub struct PaymentRecord {
    pub vault: Pubkey,
    pub sender: Pubkey,
    pub recipient: Pubkey,
    pub encrypted_amount: Euint128,
    pub timestamp: i64,
    pub nonce: u64,
    pub bump: u8,
    pub is_settled: bool,
    pub amount_hash: [u8; 32],
}
impl PaymentRecord { pub const LEN: usize = 8 + 32 + 32 + 32 + 16 + 8 + 8 + 1 + 1 + 32 + 32; }

// ============================================================
// CONTEXTS
// ============================================================

#[derive(Accounts)]
pub struct InitializeVault<'info> {
    #[account(init, payer = authority, space = VaultConfig::LEN, seeds = [b"vault_v2", authority.key().as_ref()], bump)]
    pub vault_config: Account<'info, VaultConfig>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub token_mint: InterfaceAccount<'info, Mint>,
    #[account(
        init,
        payer = authority,
        associated_token::mint = token_mint,
        associated_token::authority = vault_config,
    )]
    pub vault_token_account: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: Inco Lightning program
    #[account(address = INCO_LIGHTNING_ID)]
    pub inco_lightning_program: AccountInfo<'info>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(wallet: Pubkey)]
pub struct AddToWhitelist<'info> {
    #[account(init, payer = authority, space = Whitelist::LEN, seeds = [b"whitelist", vault_config.key().as_ref(), wallet.as_ref()], bump)]
    pub whitelist: Account<'info, Whitelist>,
    #[account(has_one = authority @ VeilPayError::Unauthorized)]
    pub vault_config: Account<'info, VaultConfig>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RemoveFromWhitelist<'info> {
    #[account(mut, close = authority, constraint = whitelist.vault == vault_config.key() @ VeilPayError::Unauthorized)]
    pub whitelist: Account<'info, Whitelist>,
    #[account(has_one = authority @ VeilPayError::Unauthorized)]
    pub vault_config: Account<'info, VaultConfig>,
    #[account(mut)]
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut, seeds = [b"vault_v2", vault_config.authority.as_ref()], bump = vault_config.bump)]
    pub vault_config: Account<'info, VaultConfig>,
    #[account(seeds = [b"whitelist", vault_config.key().as_ref(), depositor.key().as_ref()], bump = whitelist.bump)]
    pub whitelist: Account<'info, Whitelist>,
    #[account(mut)]
    pub depositor: Signer<'info>,
    #[account(mut, associated_token::mint = vault_config.token_mint, associated_token::authority = depositor)]
    pub depositor_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, associated_token::mint = vault_config.token_mint, associated_token::authority = vault_config)]
    pub vault_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(address = vault_config.token_mint)]
    pub token_mint: InterfaceAccount<'info, Mint>,
    pub token_program: Interface<'info, TokenInterface>,
    /// CHECK: Inco Lightning program
    #[account(address = INCO_LIGHTNING_ID)]
    pub inco_lightning_program: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CloseVault<'info> {
    #[account(mut, close = authority, has_one = authority @ VeilPayError::Unauthorized, seeds = [b"vault_v2", authority.key().as_ref()], bump = vault_config.bump)]
    pub vault_config: Account<'info, VaultConfig>,
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(mut, associated_token::mint = vault_config.token_mint, associated_token::authority = vault_config)]
    pub vault_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, associated_token::mint = vault_config.token_mint, associated_token::authority = authority)]
    pub authority_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(address = vault_config.token_mint)]
    pub token_mint: InterfaceAccount<'info, Mint>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct ConfidentialTransfer<'info> {
    #[account(mut, seeds = [b"vault_v2", vault_config.authority.as_ref()], bump = vault_config.bump)]
    pub vault_config: Account<'info, VaultConfig>,
    #[account(seeds = [b"whitelist", vault_config.key().as_ref(), sender.key().as_ref()], bump = whitelist.bump)]
    pub whitelist: Account<'info, Whitelist>,
    #[account(init, payer = sender, space = PaymentRecord::LEN, seeds = [b"payment", vault_config.key().as_ref(), &vault_config.payment_nonce.to_le_bytes()], bump)]
    pub payment_record: Account<'info, PaymentRecord>,
    #[account(mut)]
    pub sender: Signer<'info>,
    /// CHECK: Recipient wallet
    pub recipient: AccountInfo<'info>,
    /// CHECK: Inco Lightning program
    #[account(address = INCO_LIGHTNING_ID)]
    pub inco_lightning_program: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClaimPayment<'info> {
    #[account(mut, seeds = [b"vault_v2", vault_config.authority.as_ref()], bump = vault_config.bump)]
    pub vault_config: Account<'info, VaultConfig>,
    #[account(mut, constraint = payment_record.vault == vault_config.key() @ VeilPayError::Unauthorized, constraint = payment_record.recipient == recipient.key() @ VeilPayError::Unauthorized)]
    pub payment_record: Account<'info, PaymentRecord>,
    #[account(mut)]
    pub recipient: Signer<'info>,
    #[account(mut, associated_token::mint = vault_config.token_mint, associated_token::authority = vault_config)]
    pub vault_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(mut)]
    pub recipient_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(address = vault_config.token_mint)]
    pub token_mint: InterfaceAccount<'info, Mint>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct FreezeVault<'info> {
    #[account(mut, has_one = authority @ VeilPayError::Unauthorized, seeds = [b"vault_v2", authority.key().as_ref()], bump = vault_config.bump)]
    pub vault_config: Account<'info, VaultConfig>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct UnfreezeVault<'info> {
    #[account(mut, has_one = authority @ VeilPayError::Unauthorized, seeds = [b"vault_v2", authority.key().as_ref()], bump = vault_config.bump)]
    pub vault_config: Account<'info, VaultConfig>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct GrantDecryptAccess<'info> {
    #[account(has_one = authority @ VeilPayError::Unauthorized, seeds = [b"vault_v2", authority.key().as_ref()], bump = vault_config.bump)]
    pub vault_config: Account<'info, VaultConfig>,
    #[account(mut)]
    pub authority: Signer<'info>,
    /// CHECK: Inco Lightning program
    #[account(address = INCO_LIGHTNING_ID)]
    pub inco_lightning_program: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct GrantPaymentAccess<'info> {
    #[account(has_one = authority @ VeilPayError::Unauthorized, seeds = [b"vault_v2", authority.key().as_ref()], bump = vault_config.bump)]
    pub vault_config: Account<'info, VaultConfig>,
    pub payment_record: Account<'info, PaymentRecord>,
    #[account(mut)]
    pub authority: Signer<'info>,
    /// CHECK: Inco Lightning program
    #[account(address = INCO_LIGHTNING_ID)]
    pub inco_lightning_program: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ResetEpoch<'info> {
    #[account(mut)]
    pub vault_config: Account<'info, VaultConfig>,
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: Inco Lightning program
    #[account(address = INCO_LIGHTNING_ID)]
    pub inco_lightning_program: AccountInfo<'info>,
}

// ============================================================
// EVENTS
// ============================================================

#[event]
pub struct VaultInitialized { pub vault: Pubkey, pub authority: Pubkey, pub auditor: Pubkey, pub token_mint: Pubkey }
#[event]
pub struct ConfidentialDeposit { pub vault: Pubkey, pub depositor: Pubkey, pub amount: u64, pub timestamp: i64 }
#[event]
pub struct ConfidentialTransferEvent { pub vault: Pubkey, pub sender: Pubkey, pub recipient: Pubkey, pub nonce: u64, pub timestamp: i64 }
#[event]
pub struct PaymentSettled { pub vault: Pubkey, pub recipient: Pubkey, pub nonce: u64, pub amount: u64 }
#[event]
pub struct VaultFrozen { pub vault: Pubkey, pub frozen_by: Pubkey }

// ============================================================
// ERRORS
// ============================================================

#[error_code]
pub enum VeilPayError {
    #[msg("Wallet not whitelisted for this vault")]
    NotWhitelisted,
    #[msg("Vault is currently frozen by compliance")]
    VaultFrozen,
    #[msg("Insufficient permissions for this operation")]
    InsufficientRole,
    #[msg("Spending limit exceeded for this epoch")]
    SpendingLimitExceeded,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Invalid auditor address")]
    InvalidAuditor,
    #[msg("Not enough remaining accounts for allow() calls")]
    InsufficientAccounts,
    #[msg("Payment already settled")]
    AlreadySettled,
    #[msg("Claim amount does not match the payment hash")]
    InvalidClaimAmount,
}
