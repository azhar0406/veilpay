<p align="center">
  <img src="app/public/logo.svg" width="120" alt="VeilPay Logo" />
</p>

<h1 align="center">VeilPay</h1>

<p align="center">
  <strong>Confidential Programmable Stablecoin Payments on Solana</strong>
</p>

<p align="center">
  <em>"Veil" is also a Tamil word — it means sunlight. You cannot look at the sun with bare eyes, but with the right equipment you can observe it clearly. VeilPay works the same way: vault balances and transfer amounts are invisible on-chain, but with Inco's FHE decryption tools, authorized parties can see the exact numbers.</em>
</p>

<p align="center">
  <a href="#how-it-works">How It Works</a> &middot;
  <a href="#architecture">Architecture</a> &middot;
  <a href="#getting-started">Getting Started</a> &middot;
  <a href="#demo-flow">Demo</a>
</p>

---

## StableHacks 2026 Hackathon Submission

**Track:** Programmable Stablecoin Payments | **Chain:** Solana Devnet | **Privacy:** Inco Lightning SVM

---

## Problem

Institutions want to use stablecoins for treasury operations — payments, settlements, payroll. But on a public blockchain, every balance and transfer is visible to competitors, front-runners, and the public. Corporate treasuries can't operate in a glass house.

## Solution

VeilPay brings institutional-grade confidentiality to programmable stablecoin payments on Solana:

- **Encrypted Vault Balances** — All vault balances stored as encrypted handles via Inco Lightning FHE
- **Confidential Transfers** — Transfer amounts are fully encrypted on-chain
- **Encrypted Spending Limits** — Per-epoch spending limits enforced on encrypted values without revealing the cap
- **Selective Disclosure** — Designated auditors can decrypt balances for compliance — like wearing the right lens to see the sun
- **KYC Whitelist** — Only approved wallets can interact with vaults

---

## User Roles

VeilPay has three distinct roles:

```
User A (Authority)  — Creates the vault, manages whitelist, can freeze/unfreeze
User B (Auditor)    — Designated compliance officer, can decrypt vault balances
User C (Depositor)  — Whitelisted user who deposits tokens and makes transfers
```

---

## How It Works — Step by Step

### Step 1: Create Vault (User A — Authority)

User A creates a confidential treasury vault, choosing a stablecoin (USDC/USDT) and setting an encrypted spending limit.

```
User A ──► "Create vault with USDC, spending limit $1,000"
              │
              ▼
┌──────────────────────────────┐
│  On-Chain Vault Account      │
│  ─────────────────────────── │
│  authority: User A           │
│  auditor: User B             │
│  token: USDC                 │
│  balance: ██████ (encrypted) │  ◄── FHE: nobody can read this
│  limit:   ██████ (encrypted) │  ◄── FHE: $1,000 but hidden
│  spent:   ██████ (encrypted) │  ◄── FHE: tracked privately
└──────────────────────────────┘
```

### Step 2: Whitelist (User A — Authority)

User A approves User C to interact with the vault.

```
User A ──► "Allow User C to deposit & transfer"
              │
              ▼
┌──────────────────────┐
│  Whitelist Account    │
│  wallet: User C  ✓   │
│  role: Depositor      │
└──────────────────────┘
```

### Step 3: Deposit (User C — Depositor)

User C deposits USDC into the vault. The real tokens move via SPL transfer, and the vault's encrypted balance is updated via FHE.

```
User C ──► "Deposit 100 USDC"
              │
              ├──► Real USDC Transfer ──────────────────────┐
              │    User C's wallet ──► Vault token account  │ VISIBLE on Explorer
              │    (100 USDC moves)                         │
              │                                             │
              ├──► FHE Encryption ──────────────────────────┘
              │    encrypt(100) ──► Inco Lightning
              │    vault.balance = e_add(old_balance, encrypted_100)
              │
              ▼
┌──────────────────────────────┐
│  Vault After Deposit         │
│  ─────────────────────────── │
│  USDC in vault: 100          │  ◄── visible (SPL account)
│  balance: ██████ (encrypted) │  ◄── FHE: updated secretly
└──────────────────────────────┘
```

### Step 4: Transfer (User C — Depositor)

User C sends a confidential transfer. The spending limit is enforced **entirely on encrypted values** — the program never decrypts anything.

```
User C ──► "Send 30 USDC to Bob"
              │
              ▼
┌─────────────────────────────────────────────┐
│  FHE SPENDING LIMIT CHECK (all encrypted!)  │
│                                             │
│  new_spent = spent + 30      ◄── e_add()    │
│  ok? = (limit >= new_spent)  ◄── e_ge()     │  ALL happens on
│  actual = ok ? 30 : 0        ◄── e_select() │  ENCRYPTED values.
│  balance = balance - actual  ◄── e_sub()    │  Nobody sees the
│                                             │  numbers!
└─────────────────────────────────────────────┘
              │
              ├──► If limit OK: Real USDC transfer
              │    Vault ──► Bob's wallet (30 USDC)
              │
              ▼
┌──────────────────────────────┐
│  Vault After Transfer        │
│  balance: ██████ (encrypted) │  ◄── was 100, now 70, but hidden
│  spent:   ██████ (encrypted) │  ◄── was 0, now 30, but hidden
│  limit:   ██████ (encrypted) │  ◄── still $1,000, hidden
└──────────────────────────────┘
```

### Step 5: Audit (User B — Auditor)

Only User B can decrypt and view the vault's true state via Inco's TEE-attested decryption.

```
User B ──► "Decrypt vault balances" (signs with wallet)
              │
              ▼
Inco Covalidator ──► TEE attestation ──► reveals to User B ONLY:
   balance = 70 USDC
   spent   = 30 USDC
   limit   = 1,000 USDC

Nobody else can see these numbers. Not even User A (authority).
```

### Step 6: Freeze (User A — Authority)

User A can freeze the vault at any time for compliance. No deposits or transfers allowed while frozen.

---

## What's Private vs Public

```
┌──────────────────────────────────────────────────────────────┐
│                    WHAT'S PRIVATE vs PUBLIC                   │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  PUBLIC (visible on Solana Explorer):                        │
│  ├── SPL token transfers (amount, from, to)                 │
│  ├── Who is the authority, auditor                          │
│  ├── Which wallets are whitelisted                          │
│  └── Transaction timestamps                                 │
│                                                              │
│  PRIVATE (encrypted via Inco FHE):                          │
│  ├── Vault's internal balance tracking                      │
│  ├── Spending limit value                                   │
│  ├── How much has been spent this epoch                     │
│  ├── Spending limit enforcement logic                       │
│  │   (the check happens WITHOUT decrypting!)                │
│  └── Only the auditor (User B) can decrypt                  │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

## The FHE Magic — In Simple Terms

```
Traditional way:
  if (spent + amount <= limit)  →  everyone sees spent, amount, limit

VeilPay FHE way:
  if (██████ + ██████ <= ██████) →  nobody sees the numbers
       ▲         ▲         ▲
       │         │         │
    encrypted  encrypted  encrypted

  Inco Lightning computes on encrypted data
  and returns encrypted result — the program
  never decrypts anything, yet still enforces
  the spending limit correctly!
```

## Role Summary

| Action | Who | Real Tokens Move? | FHE Used? |
|--------|-----|-------------------|-----------|
| Create Vault | User A (Authority) | No | Yes (encrypt limit) |
| Whitelist | User A (Authority) | No | No |
| Deposit | User C (Depositor) | Yes (visible) | Yes (encrypt balance) |
| Transfer | User C (Depositor) | Yes (visible) | Yes (limit check + update) |
| Freeze/Unfreeze | User A (Authority) | No | No |
| Audit/Decrypt | User B (Auditor) | No | Yes (attested decrypt) |

---

## Architecture

```
┌──────────────┐     ┌─────────────────┐     ┌───────────────────┐
│   Next.js    │────>│  Solana Program  │────>│ Inco Covalidator  │
│   Frontend   │     │   (Anchor/Rust)  │ CPI │  (FHE off-chain)  │
│              │     │                  │     │                   │
│ Wallet       │     │ VaultConfig PDA  │     │ Encrypted values  │
│ Encrypt      │     │ Whitelist PDA    │     │ stored off-chain  │
│ Decrypt      │     │ Payment PDAs     │     │ Handles on-chain  │
└──────────────┘     └─────────────────┘     └───────────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Smart Contract | Anchor 0.31.1 (Rust) |
| Privacy | Inco Lightning SVM 0.1.4 (FHE) |
| Token Standard | SPL Token (USDC/USDT) |
| Frontend | Next.js 16, Tailwind CSS |
| Wallet | Solana Wallet Adapter (Phantom) |
| Network | Solana Devnet |

## Program Instructions

| Instruction | Description |
|------------|-------------|
| `initialize_vault` | Create a confidential treasury vault with encrypted balance and spending limit |
| `add_to_whitelist` | Whitelist a wallet with a specific role (depositor/transferrer/admin) |
| `remove_from_whitelist` | Remove a wallet from the vault whitelist |
| `deposit` | Transfer real SPL tokens into vault + update encrypted balance via FHE |
| `confidential_transfer` | Transfer encrypted amount to a recipient with spending limit checks |
| `freeze_vault` / `unfreeze_vault` | Compliance freeze/unfreeze |
| `reset_epoch` | Reset spending tracker when epoch changes |

## Getting Started

### Prerequisites

- Rust & Cargo
- Solana CLI (v3.x or compatible)
- Anchor CLI (v0.30+)
- Node.js 18+

### Build & Deploy

```bash
# Build the program
anchor build

# Deploy to devnet
solana config set --url devnet
solana airdrop 2
anchor deploy --provider.cluster devnet

# Run tests
anchor test --provider.cluster devnet
```

### Frontend

```bash
cd app
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and connect your Phantom wallet.

## Program ID

```
FVwSkmgzT1yvgJ1eWpfyXnaRnD86xfUKtBFHBLFfXkRb
```

## Demo Flow

1. **User A** connects wallet → Creates vault (sets User B as auditor, picks USDC, sets spending limit)
2. **User A** whitelists User C's wallet as a depositor
3. **User C** connects → Deposits USDC into the vault
4. **User C** sends a confidential transfer to another wallet
5. **User B** connects → Decrypts and views full vault balances and payment history
6. Check Solana Explorer — all internal vault amounts are opaque on-chain

> Like staring at the sun — the data is there on-chain, blazing in full view, but no one can read it without the right cryptographic lens.

## Team

Built for StableHacks 2026 on DoraHacks.

## License

MIT
