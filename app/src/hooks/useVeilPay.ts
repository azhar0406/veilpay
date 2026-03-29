"use client";

import { useCallback, useEffect, useState } from "react";
import { useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";
import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { createAssociatedTokenAccountInstruction } from "@solana/spl-token";
import {
  INCO_LIGHTNING_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  USDC_MINT,
  getVaultPda,
  getWhitelistPda,
  getPaymentPda,
  getAssociatedTokenAddress,
  getTokenProgramId,
  getAllowancePda,
} from "@/lib/anchor";
import { IDL } from "@/lib/idl";
import { encryptAmount, extractHandle } from "@/lib/inco";

/* eslint-disable @typescript-eslint/no-explicit-any */

function isUserRejection(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("User rejected") || msg.includes("user rejected") || msg.includes("Transaction cancelled");
}

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
  publicKey?: PublicKey;
  vault: PublicKey;
  sender: PublicKey;
  recipient: PublicKey;
  encryptedAmount: any;
  timestamp: BN;
  nonce: BN;
  bump: number;
  isSettled: boolean;
  amount: BN;
  memo: number[];
}

function getProgram(wallet: any, connection: any): Program | null {
  if (!wallet) return null;
  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  return new Program(IDL as any, provider);
}

export interface VaultListItem {
  publicKey: PublicKey;
  data: VaultData;
}

export function useVeilPay() {
  const wallet = useAnchorWallet();
  const { connection } = useConnection();
  const [vault, setVault] = useState<VaultData | null>(null);
  const [vaultPda, setVaultPda] = useState<PublicKey | null>(null);
  const [allVaults, setAllVaults] = useState<VaultListItem[]>([]);
  const [pendingPaymentsMap, setPendingPaymentsMap] = useState<Record<string, { count: number; latestMemo: string }>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch all vaults from the program
  const fetchAllVaults = useCallback(async () => {
    if (!wallet) return;
    const program = getProgram(wallet, connection);
    if (!program) return;

    try {
      const vaults = await (program.account as any).vaultConfig.all();
      setAllVaults(vaults.map((v: any) => ({ publicKey: v.publicKey, data: v.account as VaultData })));

      // Fetch pending payments for the connected wallet across all vaults
      try {
        const allPayments = await (program.account as any).paymentRecord.all([{ dataSize: 306 }]);
        const pending: Record<string, { count: number; latestMemo: string }> = {};
        for (const p of allPayments) {
          if (p.account.recipient.equals(wallet.publicKey) && !p.account.isSettled) {
            const vaultKey = p.account.vault.toBase58();
            if (!pending[vaultKey]) pending[vaultKey] = { count: 0, latestMemo: "" };
            pending[vaultKey].count++;
            if (p.account.memo) {
              const bytes = new Uint8Array(p.account.memo);
              let end = bytes.indexOf(0);
              if (end === -1) end = bytes.length;
              const memo = end > 0 ? new TextDecoder().decode(bytes.slice(0, end)) : "";
              if (memo) pending[vaultKey].latestMemo = memo;
            }
          }
        }
        setPendingPaymentsMap(pending);
      } catch { /* ignore payment fetch errors */ }
    } catch {
      setAllVaults([]);
    }
  }, [wallet, connection]);

  // Select a specific vault
  const selectVault = useCallback((pda: PublicKey, data: VaultData) => {
    setVault(data);
    setVaultPda(pda);
  }, []);

  // Go back to vault list
  const deselectVault = useCallback(() => {
    setVault(null);
    setVaultPda(null);
  }, []);

  // Fetch/refresh the currently selected vault, or auto-detect on first load
  const fetchVault = useCallback(async () => {
    if (!wallet) return;
    const program = getProgram(wallet, connection);
    if (!program) return;

    // Always refresh the vault list
    fetchAllVaults();
  }, [wallet, connection, fetchAllVaults]);

  // Refresh selected vault data (called after transactions)
  const refreshSelectedVault = useCallback(async () => {
    if (!wallet || !vaultPda) return;
    const program = getProgram(wallet, connection);
    if (!program) return;
    try {
      const data = await (program.account as any).vaultConfig.fetch(vaultPda);
      setVault(data as VaultData);
    } catch {
      setVault(null);
      setVaultPda(null);
    }
  }, [wallet, connection, vaultPda]);

  // On wallet connect: fetch list and auto-select if authority
  useEffect(() => {
    if (!wallet) {
      setVault(null);
      setVaultPda(null);
      setAllVaults([]);
      return;
    }
    const program = getProgram(wallet, connection);
    if (!program) return;

    fetchAllVaults();

    // Auto-select if wallet is an authority
    const [ownPda] = getVaultPda(wallet.publicKey);
    (program.account as any).vaultConfig.fetch(ownPda).then((data: VaultData) => {
      setVault(data);
      setVaultPda(ownPda);
    }).catch(() => { /* not authority — user picks from list */ });
  }, [wallet, connection, fetchAllVaults]);

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

        // Fetch the new vault and select it
        const data = await (program.account as any).vaultConfig.fetch(vPda);
        setVault(data as VaultData);
        setVaultPda(vPda);
        fetchAllVaults();
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : "Failed to initialize vault";
        setError(msg);
      } finally {
        setLoading(false);
      }
    },
    [wallet, connection, refreshSelectedVault]
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
        if (isUserRejection(err)) { setLoading(false); return; }
        const msg = err instanceof Error ? err.message : "Failed to add to whitelist";
        setError(msg);
        throw err;
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
        if (isUserRejection(err)) { setLoading(false); return; }
        const msg = err instanceof Error ? err.message : "Failed to remove from whitelist";
        setError(msg);
        throw err;
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

        await refreshSelectedVault();
      } catch (err: unknown) {
        if (isUserRejection(err)) { setLoading(false); return; }
        const msg = err instanceof Error ? err.message : "Deposit failed";
        setError(msg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [wallet, connection, vaultPda, vault, refreshSelectedVault]
  );

  // Confidential transfer — TEE encrypted state only, no token movement
  const transfer = useCallback(
    async (recipientAddress: string, amount: number, memo?: string) => {
      const program = getProgram(wallet, connection);
      if (!program || !wallet || !vaultPda || !vault) {
        setError("Wallet not connected or vault not found");
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const recipient = new PublicKey(recipientAddress);
        const [whitelistPda] = getWhitelistPda(vaultPda, wallet.publicKey);
        const nonce = vault.paymentNonce.toNumber();
        const [paymentPda] = getPaymentPda(vaultPda, nonce);

        const { ciphertext, inputType } = await encryptAmount(BigInt(amount));
        // amount in token smallest unit (6 decimals for USDC/USDT)
        const tokenAmount = new BN(amount).mul(new BN(10).pow(new BN(6)));

        const memoBytes = Buffer.alloc(128);
        if (memo) {
          const encoded = new TextEncoder().encode(memo.slice(0, 128));
          memoBytes.set(encoded, 0);
        }

        await (program.methods as any)
          .confidentialTransfer(Buffer.from(ciphertext), inputType, tokenAmount, memoBytes)
          .accounts({
            vaultConfig: vaultPda,
            whitelist: whitelistPda,
            paymentRecord: paymentPda,
            sender: wallet.publicKey,
            recipient,
            incoLightningProgram: INCO_LIGHTNING_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        await refreshSelectedVault();
      } catch (err: unknown) {
        if (isUserRejection(err)) { setLoading(false); return; }
        const msg = err instanceof Error ? err.message : "Transfer failed";
        setError(msg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [wallet, connection, vaultPda, vault, refreshSelectedVault]
  );

  // Freeze / Unfreeze
  // Close vault — returns tokens + rent to authority
  const closeVault = useCallback(async () => {
    const program = getProgram(wallet, connection);
    if (!program || !wallet || !vault) {
      setError("Wallet not connected or vault not found");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [freshVaultPda] = getVaultPda(wallet.publicKey);
      const mint = vault.tokenMint;
      const vaultTokenAccount = getAssociatedTokenAddress(mint, freshVaultPda);
      const authorityTokenAccount = getAssociatedTokenAddress(mint, wallet.publicKey);

      await (program.methods as any)
        .closeVault()
        .accounts({
          vaultConfig: freshVaultPda,
          authority: wallet.publicKey,
          vaultTokenAccount,
          authorityTokenAccount,
          tokenMint: mint,
          tokenProgram: getTokenProgramId(mint),
        })
        .rpc();

      await refreshSelectedVault();
    } catch (err: unknown) {
      if (isUserRejection(err)) { setLoading(false); return; }
      const msg = err instanceof Error ? err.message : "Close vault failed";
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [wallet, connection, vault, refreshSelectedVault]);

  const toggleFreeze = useCallback(async () => {
    const program = getProgram(wallet, connection);
    if (!program || !wallet || !vault) {
      setError("Wallet not connected or vault not found");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Always derive PDA fresh from the connected wallet to avoid stale state
      const [freshVaultPda] = getVaultPda(wallet.publicKey);
      const method = vault.isFrozen ? "unfreezeVault" : "freezeVault";
      await (program.methods as any)
        [method]()
        .accounts({
          vaultConfig: freshVaultPda,
          authority: wallet.publicKey,
        })
        .rpc();

      await refreshSelectedVault();
    } catch (err: unknown) {
      if (isUserRejection(err)) { setLoading(false); return; }
      const msg = err instanceof Error ? err.message : "Freeze/unfreeze failed";
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [wallet, connection, vault, refreshSelectedVault]);

  // Fetch payment records
  const fetchPayments = useCallback(async (): Promise<PaymentData[]> => {
    const program = getProgram(wallet, connection);
    if (!program || !vaultPda) return [];

    try {
      const accounts = await (program.account as any).paymentRecord.all([
        {
          dataSize: 306, // Filter out old payment records with wrong struct size
        },
        {
          memcmp: {
            offset: 8,
            bytes: vaultPda.toBase58(),
          },
        },
      ]);
      return accounts.map((a: { publicKey: PublicKey; account: PaymentData }) => ({ ...a.account, publicKey: a.publicKey }));
    } catch {
      return [];
    }
  }, [wallet, connection, vaultPda]);

  // Claim a payment — recipient clicks claim, amount read from payment record
  const claimPayment = useCallback(
    async (paymentPda: PublicKey) => {
      const program = getProgram(wallet, connection);
      if (!program || !wallet || !vaultPda || !vault) {
        setError("Wallet not connected or vault not found");
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const mint = vault.tokenMint;
        const tokenProgramId = getTokenProgramId(mint);
        const vaultTokenAccount = getAssociatedTokenAddress(mint, vaultPda);
        const recipientTokenAccount = getAssociatedTokenAddress(mint, wallet.publicKey);

        // Create own token account if it doesn't exist
        const recipientAtaInfo = await connection.getAccountInfo(recipientTokenAccount);
        if (!recipientAtaInfo) {
          const createAtaIx = createAssociatedTokenAccountInstruction(
            wallet.publicKey, recipientTokenAccount, wallet.publicKey, mint, tokenProgramId,
          );
          const { blockhash } = await connection.getLatestBlockhash();
          const tx = new Transaction({ feePayer: wallet.publicKey, recentBlockhash: blockhash }).add(createAtaIx);
          const signed = await wallet.signTransaction(tx);
          const sig = await connection.sendRawTransaction(signed.serialize());
          await connection.confirmTransaction(sig, "confirmed");
        }

        await (program.methods as any)
          .claimPayment()
          .accounts({
            vaultConfig: vaultPda,
            paymentRecord: paymentPda,
            recipient: wallet.publicKey,
            vaultTokenAccount,
            recipientTokenAccount,
            tokenMint: mint,
            tokenProgram: tokenProgramId,
          })
          .rpc();

        await refreshSelectedVault();
      } catch (err: unknown) {
        if (isUserRejection(err)) { setLoading(false); return; }
        const msg = err instanceof Error ? err.message : "Claim failed";
        setError(msg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [wallet, connection, vaultPda, vault, refreshSelectedVault]
  );

  // Grant decrypt access to authority and auditor for all vault handles
  const grantDecryptAccess = useCallback(async () => {
    const program = getProgram(wallet, connection);
    if (!program || !wallet || !vaultPda || !vault) {
      setError("Wallet not connected or vault not found");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [freshVaultPda] = getVaultPda(wallet.publicKey);
      const handles = [
        BigInt(extractHandle(vault.encryptedBalance)),
        BigInt(extractHandle(vault.encryptedSpendingLimit)),
        BigInt(extractHandle(vault.encryptedSpentThisEpoch)),
      ];
      const addrs = [vault.authority, vault.auditor];

      // Build remaining accounts: for each handle × each address, we need [allowancePda, allowedAddress]
      const remainingAccounts: { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[] = [];
      for (const h of handles) {
        for (const addr of addrs) {
          const [allowancePda] = getAllowancePda(h, addr);
          remainingAccounts.push({ pubkey: allowancePda, isSigner: false, isWritable: true });
          remainingAccounts.push({ pubkey: addr, isSigner: false, isWritable: false });
        }
      }

      await (program.methods as any)
        .grantDecryptAccess()
        .accounts({
          vaultConfig: freshVaultPda,
          authority: wallet.publicKey,
          incoLightningProgram: INCO_LIGHTNING_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .remainingAccounts(remainingAccounts)
        .rpc();

    } catch (err: unknown) {
      if (isUserRejection(err)) { setLoading(false); return; }
      const msg = err instanceof Error ? err.message : "Grant access failed";
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [wallet, connection, vaultPda, vault]);

  // Grant decrypt access for a specific payment record
  const grantPaymentAccess = useCallback(async (paymentPda: PublicKey, encryptedAmountHandle: bigint) => {
    const program = getProgram(wallet, connection);
    if (!program || !wallet || !vaultPda || !vault) {
      setError("Wallet not connected or vault not found");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [freshVaultPda] = getVaultPda(wallet.publicKey);
      const addrs = [vault.authority, vault.auditor];

      const remainingAccounts: { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[] = [];
      for (const addr of addrs) {
        const [allowancePda] = getAllowancePda(encryptedAmountHandle, addr);
        remainingAccounts.push({ pubkey: allowancePda, isSigner: false, isWritable: true });
        remainingAccounts.push({ pubkey: addr, isSigner: false, isWritable: false });
      }

      await (program.methods as any)
        .grantPaymentAccess()
        .accounts({
          vaultConfig: freshVaultPda,
          paymentRecord: paymentPda,
          authority: wallet.publicKey,
          incoLightningProgram: INCO_LIGHTNING_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .remainingAccounts(remainingAccounts)
        .rpc();

    } catch (err: unknown) {
      if (isUserRejection(err)) { setLoading(false); return; }
      const msg = err instanceof Error ? err.message : "Grant payment access failed";
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [wallet, connection, vaultPda, vault]);

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
    fetchVault: refreshSelectedVault,
    grantDecryptAccess,
    grantPaymentAccess,
    claimPayment,
    closeVault,
    allVaults,
    selectVault,
    deselectVault,
    fetchAllVaults,
    pendingPaymentsMap,
  };
}
