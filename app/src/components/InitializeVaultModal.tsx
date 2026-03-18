"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";

interface Props {
  onClose: () => void;
  onSubmit: (auditor: string, spendingLimit: number) => Promise<void>;
  loading: boolean;
}

export default function InitializeVaultModal({ onClose, onSubmit, loading }: Props) {
  const { publicKey } = useWallet();
  const [auditor, setAuditor] = useState("");
  const [spendingLimit, setSpendingLimit] = useState("1000000");
  const [localError, setLocalError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError("");

    if (!auditor || auditor.length < 32) {
      setLocalError("Enter a valid Solana address for the auditor");
      return;
    }
    if (!spendingLimit || Number(spendingLimit) <= 0) {
      setLocalError("Spending limit must be greater than 0");
      return;
    }

    try {
      await onSubmit(auditor, Number(spendingLimit));
      onClose();
    } catch (err: unknown) {
      setLocalError(err instanceof Error ? err.message : "Transaction failed");
    }
  };

  const useSelfAsAuditor = () => {
    if (publicKey) setAuditor(publicKey.toBase58());
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-40 p-4"
      style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(8px)" }}
    >
      <div
        className="w-full max-w-md rounded-2xl overflow-hidden"
        style={{ background: "var(--card)", border: "1px solid var(--card-border)" }}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-2 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-white">Create Vault</h3>
            <p style={{ color: "var(--muted)", fontSize: "13px", marginTop: "2px" }}>
              Set up your confidential treasury vault
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
            style={{ background: "var(--surface)", color: "var(--muted)" }}
          >
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 pb-6 pt-4 space-y-5">
          {/* Auditor Address */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-white">
                Auditor Address
              </label>
              <button
                type="button"
                onClick={useSelfAsAuditor}
                className="text-xs font-medium transition-colors"
                style={{ color: "var(--accent)" }}
              >
                Use my wallet
              </button>
            </div>
            <input
              type="text"
              value={auditor}
              onChange={(e) => setAuditor(e.target.value)}
              placeholder="e.g. 9xQe...3Kp2 (Solana wallet address)"
              className="w-full rounded-xl px-4 py-3 text-sm font-mono text-white focus:outline-none transition-colors"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--card-border)",
              }}
            />
            <p style={{ color: "var(--muted)", fontSize: "12px", marginTop: "6px", lineHeight: "1.5" }}>
              The auditor can decrypt vault balances and payment amounts for compliance.
              For testing, you can use your own wallet address.
            </p>
          </div>

          {/* Spending Limit */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Spending Limit per Epoch
            </label>
            <div className="relative">
              <input
                type="number"
                value={spendingLimit}
                onChange={(e) => setSpendingLimit(e.target.value)}
                placeholder="1000000"
                min="1"
                className="w-full rounded-xl px-4 py-3 text-sm font-mono text-white focus:outline-none transition-colors"
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--card-border)",
                }}
              />
              <span
                className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-semibold"
                style={{ color: "var(--muted)" }}
              >
                UNITS
              </span>
            </div>
            <p style={{ color: "var(--muted)", fontSize: "12px", marginTop: "6px", lineHeight: "1.5" }}>
              Maximum total amount that can be transferred per Solana epoch (~2 days).
              This limit is encrypted on-chain and enforced via FHE computation.
            </p>

            {/* Quick presets */}
            <div className="flex gap-2 mt-3">
              {[
                { label: "100K", value: "100000" },
                { label: "1M", value: "1000000" },
                { label: "10M", value: "10000000" },
                { label: "100M", value: "100000000" },
              ].map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => setSpendingLimit(preset.value)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                  style={{
                    background: spendingLimit === preset.value ? "rgba(59,130,246,0.15)" : "var(--surface)",
                    color: spendingLimit === preset.value ? "#60a5fa" : "var(--muted)",
                    border: `1px solid ${spendingLimit === preset.value ? "rgba(59,130,246,0.3)" : "var(--card-border)"}`,
                  }}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Info box */}
          <div
            className="rounded-xl p-4 text-sm"
            style={{
              background: "rgba(59,130,246,0.06)",
              border: "1px solid rgba(59,130,246,0.12)",
              color: "var(--muted-light)",
              lineHeight: "1.6",
            }}
          >
            <p className="font-semibold text-white mb-1.5">&#128274; What gets encrypted?</p>
            <ul className="space-y-1" style={{ paddingLeft: "16px", listStyleType: "disc", fontSize: "12px" }}>
              <li>Vault balance &mdash; invisible on Solana Explorer</li>
              <li>Spending limit &mdash; enforced without revealing the cap</li>
              <li>All transfer amounts &mdash; only authorized parties can decrypt</li>
            </ul>
          </div>

          {localError && (
            <p className="text-sm font-medium" style={{ color: "var(--danger)" }}>
              {localError}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 text-white rounded-xl font-semibold text-sm transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0"
            style={{
              background: "linear-gradient(135deg, #3b82f6, #2563eb)",
              boxShadow: "0 4px 16px rgba(59,130,246,0.25)",
            }}
          >
            {loading ? "Creating Vault..." : "Create Confidential Vault"}
          </button>
        </form>
      </div>
    </div>
  );
}
