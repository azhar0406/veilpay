"use client";

import { useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { USDC_MINT, USDT_MINT } from "@/lib/anchor";

interface Props {
  onClose: () => void;
  onSubmit: (recipient: string, amount: number) => Promise<void>;
  loading: boolean;
  myDeposits: number;
  tokenMint: PublicKey;
}

function isValidSolanaAddress(addr: string): boolean {
  try {
    new PublicKey(addr);
    return true;
  } catch {
    return false;
  }
}

function getTokenName(mint: PublicKey): string {
  if (mint.equals(USDC_MINT)) return "USDC";
  if (mint.equals(USDT_MINT)) return "USDT";
  return "Token";
}

export default function TransferModal({ onClose, onSubmit, loading, myDeposits, tokenMint }: Props) {
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [localError, setLocalError] = useState("");
  const tokenName = getTokenName(tokenMint);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError("");

    const trimmed = recipient.trim();
    if (!trimmed || !isValidSolanaAddress(trimmed)) {
      setLocalError("Enter a valid Solana wallet address (base58)");
      return;
    }
    const num = Number(amount);
    if (!amount || num <= 0) {
      setLocalError("Enter a valid amount");
      return;
    }
    if (num > myDeposits) {
      setLocalError(`Insufficient balance. You have ${myDeposits} ${tokenName}`);
      return;
    }

    try {
      await onSubmit(trimmed, num);
      onClose();
    } catch (err: unknown) {
      setLocalError(err instanceof Error ? err.message : "Transfer failed");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-40 p-4">
      <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-2xl p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-white">Confidential Transfer</h3>
          <button onClick={onClose} className="text-[var(--muted)] hover:text-white text-xl">&times;</button>
        </div>

        {/* My Balance */}
        <div className="bg-[var(--background)] border border-[var(--card-border)] rounded-lg p-3 mb-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-[var(--muted)]">My Deposited Balance</span>
            <span className="text-white font-mono font-semibold">{myDeposits} {tokenName}</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-[var(--muted)] mb-1.5">Recipient Address</label>
            <input
              type="text"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="Recipient's Solana wallet"
              className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded-lg px-3 py-2.5 text-white text-sm font-mono placeholder:text-[var(--muted)]/50 focus:outline-none focus:border-[var(--accent)]"
            />
          </div>

          <div>
            <label className="block text-sm text-[var(--muted)] mb-1.5">Amount ({tokenName})</label>
            <div className="relative">
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                min="0.000001"
                step="any"
                className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded-lg px-3 py-2.5 text-white text-sm font-mono placeholder:text-[var(--muted)]/50 focus:outline-none focus:border-[var(--accent)]"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-[var(--muted)]">
                {tokenName}
              </span>
            </div>
            {myDeposits > 0 && (
              <button
                type="button"
                onClick={() => setAmount(String(myDeposits))}
                className="text-xs text-[var(--accent)] mt-1 hover:underline"
              >
                Max: {myDeposits} {tokenName}
              </button>
            )}
          </div>

          <div className="bg-[var(--background)] border border-[var(--card-border)] rounded-lg p-3">
            <div className="flex items-center gap-2 text-sm">
              <span>&#128274;</span>
              <span className="text-[var(--muted)]">
                Transfer is <span className="text-[var(--accent)]">fully encrypted</span>. No token movement on-chain.
                Recipient claims later with the amount you share.
              </span>
            </div>
          </div>

          {localError && (
            <p className="text-sm text-[var(--danger)]">{localError}</p>
          )}

          <button
            type="submit"
            disabled={loading || myDeposits === 0}
            className="w-full py-3 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-xl font-medium transition-colors disabled:opacity-50"
          >
            {loading ? "Encrypting & Transferring..." : `Transfer ${amount || "0"} ${tokenName}`}
          </button>
        </form>
      </div>
    </div>
  );
}
