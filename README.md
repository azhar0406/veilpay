# VeilPay — Confidential Programmable Stablecoin Payments on Solana

> Institutional-grade privacy for treasury payments using Inco Lightning's confidential computing on Solana.

## StableHacks 2026 Hackathon Submission

**Track:** Programmable Stablecoin Payments | **Chain:** Solana Devnet | **Privacy:** Inco Lightning SVM

---

## Problem

Institutions want to use stablecoins for treasury operations — payments, settlements, payroll. But on a public blockchain, every balance and transfer is visible to competitors, front-runners, and the public. Corporate treasuries can't operate in a glass house.

## Solution

VeilPay brings institutional-grade confidentiality to programmable stablecoin payments on Solana:

- **Encrypted Vault Balances** — All vault balances stored as encrypted handles via Inco Lightning
- **Confidential Transfers** — Transfer amounts are fully encrypted on-chain
- **Encrypted Spending Limits** — Per-epoch spending limits enforced on encrypted values
- **Selective Disclosure** — Designated auditors can decrypt balances for compliance
- **KYC Whitelist** — Only approved wallets can interact with vaults

## Architecture

```
┌──────────────┐     ┌─────────────────┐     ┌───────────────────┐
│   Next.js    │────▶│  Solana Program  │────▶│ Inco Covalidator  │
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
| Privacy | Inco Lightning SVM 0.1.4 |
| Frontend | Next.js 16, Tailwind CSS |
| Wallet | Solana Wallet Adapter |
| Network | Solana Devnet |

## Program Instructions

| Instruction | Description |
|------------|-------------|
| `initialize_vault` | Create a confidential treasury vault with encrypted balance and spending limit |
| `add_to_whitelist` | Whitelist a wallet with a specific role (depositor/transferrer/admin) |
| `remove_from_whitelist` | Remove a wallet from the vault whitelist |
| `deposit` | Deposit an encrypted amount into the vault |
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

Open [http://localhost:3000](http://localhost:3000) and connect your Phantom/Solflare wallet.

## Program ID

```
FVwSkmgzT1yvgJ1eWpfyXnaRnD86xfUKtBFHBLFfXkRb
```

## How It Works

1. **Treasury admin** creates a confidential vault with an encrypted spending limit
2. **Admin whitelists** approved wallets with specific roles
3. **Depositors** encrypt amounts client-side and deposit — balance updates are encrypted on-chain
4. **Transferrers** send confidential payments — amounts invisible on Solana Explorer
5. **Auditor** can decrypt vault balances and payment amounts for compliance review
6. All encrypted operations use Inco Lightning's FHE (Fully Homomorphic Encryption) via CPI

## Demo Flow

1. Connect wallet → Create Vault (set auditor + spending limit)
2. Whitelist a depositor wallet
3. Deposit encrypted amount
4. Send confidential transfer
5. Switch to auditor wallet → Decrypt and view full history
6. Check Solana Explorer — all amounts are opaque on-chain

## Team

Built for StableHacks 2026 on DoraHacks.

## License

MIT
