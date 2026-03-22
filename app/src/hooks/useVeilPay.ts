"use client";

import { useCallback, useEffect, useState } from "react";
import { useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";
import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import {
  INCO_LIGHTNING_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  USDC_MINT,
  getVaultPda,
  getWhitelistPda,
  getPaymentPda,
  getAssociatedTokenAddress,
  getTokenProgramId,
} from "@/lib/anchor";
import { IDL } from "@/lib/idl";
import { encryptAmount } from "@/lib/inco";

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface VaultData {
  authority: PublicKey;
  auditor: PublicKey;
  tokenMint: PublicKey;
  encryptedBalance: any;
  encryptedSpendingLimit: any;
  encryptedSpentThisEpoch: any;
  currentEpoch: BN;
  paymentNonce: BN;
  isFrozen: boolean;
  bump: number;
}

export interface PaymentData {
  vault: PublicKey;
  sender: PublicKey;
  recipient: PublicKey;
  encryptedAmount: any;
  timestamp: BN;
  nonce: BN;
  bump: number;
}

function getProgram(wallet: any, connection: any): Program | null {
  if (!wallet) return null;
  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  return new Program(IDL as any, provider);
}

// The authority address that created the vault — hardcoded for this hackathon demo
// so that auditor and other wallets can also find the vault.
const VAULT_AUTHORITY = new PublicKey(
  "3JQwsFy8RFmjF4CkzDZV5c3zizrGdvdz5pQV78ziGQeq"
);

export function useVeilPay() {
  const wallet = useAnchorWallet();
  const { connection } = useConnection();
  const [vault, setVault] = useState<VaultData | null>(null);
  const [vaultPda, setVaultPda] = useState<PublicKey | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch vault data
  const fetchVault = useCallback(async () => {
    if (!wallet) return;
    const program = getProgram(wallet, connection);
    if (!program) return;

    const [ownPda] = getVaultPda(wallet.publicKey);
    const [authorityPda] = getVaultPda(VAULT_AUTHORITY);

    for (const pda of [ownPda, authorityPda]) {
      try {
        const data = await (program.account as any).vaultConfig.fetch(pda);
        setVault(data as VaultData);
        setVaultPda(pda);
        setError(null);
        return;
      } catch {
        // Try next
      }
    }
    setVault(null);
    setVaultPda(null);
  }, [wallet, connection]);

  useEffect(() => {
    fetchVault();
  }, [fetchVault]);

  // Initialize vault with a token mint
  const initializeVault = useCallback(
    async (auditorAddress: string, spendingLimit: number, tokenMint?: PublicKey) => {
      const program = getProgram(wallet, connection);
      if (!program || !wallet) {
        setError("Wallet not connected");
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const auditor = new PublicKey(auditorAddress);
        const mint = tokenMint || USDC_MINT;
        const [vPda] = getVaultPda(wallet.publicKey);
        const vaultTokenAccount = getAssociatedTokenAddress(mint, vPda);
        const { ciphertext, inputType } = await encryptAmount(
          BigInt(spendingLimit)
        );

        await (program.methods as any)
          .initializeVault(auditor, Buffer.from(ciphertext), inputType)
          .accounts({
            vaultConfig: vPda,
            authority: wallet.publicKey,
            tokenMint: mint,
            vaultTokenAccount,
            incoLightningProgram: INCO_LIGHTNING_PROGRAM_ID,
            tokenProgram: getTokenProgramId(mint),
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        await fetchVault();
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : "Failed to initialize vault";
        setError(msg);
      } finally {
        setLoading(false);
      }
    },
    [wallet, connection, fetchVault]
  );

  // Add to whitelist
  const addToWhitelist = useCallback(
    async (walletAddress: string, role: number) => {
      const program = getProgram(wallet, connection);
      if (!program || !wallet || !vaultPda) {
        setError("Wallet not connected or vault not found");
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const targetWallet = new PublicKey(walletAddress);
        const [whitelistPda] = getWhitelistPda(vaultPda, targetWallet);

        await (program.methods as any)
          .addToWhitelist(targetWallet, role)
          .accounts({
            whitelist: whitelistPda,
            vaultConfig: vaultPda,
            authority: wallet.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        setError(null);
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : "Failed to add to whitelist";
        setError(msg);
      } finally {
        setLoading(false);
      }
    },
    [wallet, connection, vaultPda]
  );

  // Remove from whitelist
  const removeFromWhitelist = useCallback(
    async (walletAddress: string) => {
      const program = getProgram(wallet, connection);
      if (!program || !wallet || !vaultPda) {
        setError("Wallet not connected or vault not found");
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const targetWallet = new PublicKey(walletAddress);
        const [whitelistPda] = getWhitelistPda(vaultPda, targetWallet);

        await (program.methods as any)
          .removeFromWhitelist()
          .accounts({
            whitelist: whitelistPda,
            vaultConfig: vaultPda,
            authority: wallet.publicKey,
          })
          .rpc();
      } catch (err: unknown) {
        const msg =
          err instanceof Error
            ? err.message
            : "Failed to remove from whitelist";
        setError(msg);
      } finally {
        setLoading(false);
      }
    },
    [wallet, connection, vaultPda]
  );

  // Deposit — transfers real tokens + updates encrypted balance
  const deposit = useCallback(
    async (amount: number) => {
      const program = getProgram(wallet, connection);
      if (!program || !wallet || !vaultPda || !vault) {
        setError("Wallet not connected or vault not found");
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const mint = vault.tokenMint;
        const [whitelistPda] = getWhitelistPda(vaultPda, wallet.publicKey);
        const depositorTokenAccount = getAssociatedTokenAddress(mint, wallet.publicKey);
        const vaultTokenAccount = getAssociatedTokenAddress(mint, vaultPda);
        const { ciphertext, inputType } = await encryptAmount(BigInt(amount));

        // amount in token smallest unit (assuming 6 decimals for USDC/USDT)
        const tokenAmount = new BN(amount).mul(new BN(10).pow(new BN(6)));

        await (program.methods as any)
          .deposit(Buffer.from(ciphertext), inputType, tokenAmount)
          .accounts({
            vaultConfig: vaultPda,
            whitelist: whitelistPda,
            depositor: wallet.publicKey,
            depositorTokenAccount,
            vaultTokenAccount,
            tokenMint: mint,
            tokenProgram: getTokenProgramId(mint),
            incoLightningProgram: INCO_LIGHTNING_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        await fetchVault();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Deposit failed";
        setError(msg);
      } finally {
        setLoading(false);
      }
    },
    [wallet, connection, vaultPda, vault, fetchVault]
  );

  // Confidential transfer — FHE checks + real token transfer
  const transfer = useCallback(
    async (recipientAddress: string, amount: number) => {
      const program = getProgram(wallet, connection);
      if (!program || !wallet || !vaultPda || !vault) {
        setError("Wallet not connected or vault not found");
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const recipient = new PublicKey(recipientAddress);
        const mint = vault.tokenMint;
        const [whitelistPda] = getWhitelistPda(vaultPda, wallet.publicKey);
        const nonce = vault.paymentNonce.toNumber();
        const [paymentPda] = getPaymentPda(vaultPda, nonce);
        const vaultTokenAccount = getAssociatedTokenAddress(mint, vaultPda);
        const recipientTokenAccount = getAssociatedTokenAddress(mint, recipient);
        const { ciphertext, inputType } = await encryptAmount(BigInt(amount));

        // amount in token smallest unit (assuming 6 decimals for USDC/USDT)
        const tokenAmount = new BN(amount).mul(new BN(10).pow(new BN(6)));

        await (program.methods as any)
          .confidentialTransfer(Buffer.from(ciphertext), inputType, tokenAmount)
          .accounts({
            vaultConfig: vaultPda,
            whitelist: whitelistPda,
            paymentRecord: paymentPda,
            sender: wallet.publicKey,
            recipient,
            vaultTokenAccount,
            recipientTokenAccount,
            tokenMint: mint,
            tokenProgram: getTokenProgramId(mint),
            incoLightningProgram: INCO_LIGHTNING_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        await fetchVault();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Transfer failed";
        setError(msg);
      } finally {
        setLoading(false);
      }
    },
    [wallet, connection, vaultPda, vault, fetchVault]
  );

  // Freeze / Unfreeze
  const toggleFreeze = useCallback(async () => {
    const program = getProgram(wallet, connection);
    if (!program || !wallet || !vaultPda || !vault) {
      setError("Wallet not connected or vault not found");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const method = vault.isFrozen ? "unfreezeVault" : "freezeVault";
      await (program.methods as any)
        [method]()
        .accounts({
          vaultConfig: vaultPda,
          authority: wallet.publicKey,
        })
        .rpc();

      await fetchVault();
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Freeze/unfreeze failed";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [wallet, connection, vaultPda, vault, fetchVault]);

  // Fetch payment records
  const fetchPayments = useCallback(async (): Promise<PaymentData[]> => {
    const program = getProgram(wallet, connection);
    if (!program || !vaultPda) return [];

    try {
      const accounts = await (program.account as any).paymentRecord.all([
        {
          memcmp: {
            offset: 8,
            bytes: vaultPda.toBase58(),
          },
        },
      ]);
      return accounts.map((a: { account: PaymentData }) => a.account);
    } catch {
      return [];
    }
  }, [wallet, connection, vaultPda]);

  return {
    wallet,
    vault,
    vaultPda,
    loading,
    error,
    initializeVault,
    addToWhitelist,
    removeFromWhitelist,
    deposit,
    transfer,
    toggleFreeze,
    fetchPayments,
    fetchVault,
  };
}
