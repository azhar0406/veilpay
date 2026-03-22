"use client";

import { useState, useEffect } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddress, getTokenProgramId, USDC_MINT, USDT_MINT } from "@/lib/anchor";

interface Props {
  onClose: () => void;
  onSubmit: (amount: number) => Promise<void>;
  loading: boolean;
  tokenMint: PublicKey;
}

function getTokenName(mint: PublicKey): string {
  if (mint.equals(USDC_MINT)) return "USDC";
  if (mint.equals(USDT_MINT)) return "USDT";
  return "Token";
}

export default function DepositModal({ onClose, onSubmit, loading, tokenMint }: Props) {
  const { publicKey } = useWallet();
  const { connection } = useConnection();
  const [amount, setAmount] = useState("");
  const [localError, setLocalError] = useState("");
  const [balance, setBalance] = useState<number | null>(null);

  const tokenName = getTokenName(tokenMint);

  // Fetch user's token balance
  useEffect(() => {
    if (!publicKey) return;
    const ata = getAssociatedTokenAddress(tokenMint, publicKey);
    connection.getTokenAccountBalance(ata).then((res) => {
      setBalance(Number(res.value.uiAmount));
    }).catch(() => setBalance(0));
  }, [publicKey, tokenMint, connection]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError("");

    const num = Number(amount);
    if (!amount || num <= 0) {
      setLocalError("Enter a valid amount");
      return;
    }
    if (balance !== null && num > balance) {
      setLocalError(`Insufficient balance. You have ${balance} ${tokenName}`);
      return;
    }

    try {
      await onSubmit(num);
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

        {/* Balance display */}
        <div className="bg-[var(--background)] border border-[var(--card-border)] rounded-lg p-3 mb-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-[var(--muted)]">Your {tokenName} Balance</span>
            <span className="text-white font-mono font-semibold">
              {balance !== null ? `${balance.toLocaleString()} ${tokenName}` : "Loading..."}
            </span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-[var(--muted)] mb-1.5">Amount ({tokenName})</label>
            <div className="relative">
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={`0.00`}
                min="0.000001"
                step="any"
                className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded-lg px-3 py-2.5 text-white text-sm font-mono placeholder:text-[var(--muted)]/50 focus:outline-none focus:border-[var(--accent)]"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-[var(--muted)]">
                {tokenName}
              </span>
            </div>
            {balance !== null && (
              <button
                type="button"
                onClick={() => setAmount(String(balance))}
                className="text-xs text-[var(--accent)] mt-1 hover:underline"
              >
                Max: {balance.toLocaleString()} {tokenName}
              </button>
            )}
          </div>

          {/* Quick presets */}
          <div className="flex gap-2">
            {[1, 10, 100, 500].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setAmount(String(preset))}
                className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                style={{
                  background: amount === String(preset) ? "rgba(59,130,246,0.15)" : "var(--surface)",
                  color: amount === String(preset) ? "#60a5fa" : "var(--muted)",
                  border: `1px solid ${amount === String(preset) ? "rgba(59,130,246,0.3)" : "var(--card-border)"}`,
                }}
              >
                ${preset}
              </button>
            ))}
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
            {loading ? "Encrypting & Depositing..." : `Deposit ${amount || "0"} ${tokenName}`}
          </button>
        </form>
      </div>
    </div>
  );
}
