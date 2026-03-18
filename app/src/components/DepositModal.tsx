"use client";

import { useState } from "react";

interface Props {
  onClose: () => void;
  onSubmit: (amount: number) => Promise<void>;
  loading: boolean;
}

export default function DepositModal({ onClose, onSubmit, loading }: Props) {
  const [amount, setAmount] = useState("");
  const [localError, setLocalError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError("");

    if (!amount || Number(amount) <= 0) {
      setLocalError("Enter a valid amount");
      return;
    }

    try {
      await onSubmit(Number(amount));
      onClose();
    } catch (err: unknown) {
      setLocalError(err instanceof Error ? err.message : "Deposit failed");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-40 p-4">
      <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-2xl p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-white">Confidential Deposit</h3>
          <button onClick={onClose} className="text-[var(--muted)] hover:text-white text-xl">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-[var(--muted)] mb-1.5">Amount</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Amount to deposit"
              min="1"
              className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded-lg px-3 py-2.5 text-white text-sm font-mono placeholder:text-[var(--muted)]/50 focus:outline-none focus:border-[var(--accent)]"
            />
            <p className="text-xs text-[var(--muted)] mt-1">
              Amount will be encrypted before being sent on-chain
            </p>
          </div>

          <div className="bg-[var(--background)] border border-[var(--card-border)] rounded-lg p-3">
            <div className="flex items-center gap-2 text-sm">
              <span>&#128274;</span>
              <span className="text-[var(--muted)]">
                Your deposit amount is <span className="text-[var(--accent)]">end-to-end encrypted</span> using Inco Lightning.
                No one can see the amount on-chain.
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
            {loading ? "Encrypting & Depositing..." : "Deposit"}
          </button>
        </form>
      </div>
    </div>
  );
}
