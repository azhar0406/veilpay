"use client";

import { useState } from "react";
import { PublicKey } from "@solana/web3.js";

interface Props {
  onClose: () => void;
  onSubmit: (recipient: string, amount: number) => Promise<void>;
  loading: boolean;
}

function isValidSolanaAddress(addr: string): boolean {
  try {
    new PublicKey(addr);
    return true;
  } catch {
    return false;
  }
}

export default function TransferModal({ onClose, onSubmit, loading }: Props) {
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [localError, setLocalError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError("");

    const trimmed = recipient.trim();
    if (!trimmed || !isValidSolanaAddress(trimmed)) {
      setLocalError("Enter a valid Solana wallet address (base58)");
      return;
    }
    if (!amount || Number(amount) <= 0) {
      setLocalError("Enter a valid amount");
      return;
    }

    try {
      await onSubmit(trimmed, Number(amount));
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
            <label className="block text-sm text-[var(--muted)] mb-1.5">Amount</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Amount to transfer"
              min="1"
              className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded-lg px-3 py-2.5 text-white text-sm font-mono placeholder:text-[var(--muted)]/50 focus:outline-none focus:border-[var(--accent)]"
            />
          </div>

          <div className="bg-[var(--background)] border border-[var(--card-border)] rounded-lg p-3">
            <div className="flex items-center gap-2 text-sm">
              <span>&#128274;</span>
              <span className="text-[var(--muted)]">
                Transfer amount is <span className="text-[var(--accent)]">fully encrypted</span>.
                Spending limits are enforced on encrypted values.
              </span>
            </div>
          </div>

          {localError && (
            <p className="text-sm text-[var(--danger)]">{localError}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-xl font-medium transition-colors disabled:opacity-50"
          >
            {loading ? "Encrypting & Transferring..." : "Send Transfer"}
          </button>
        </form>
      </div>
    </div>
  );
}
