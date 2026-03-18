"use client";

import { useState } from "react";

interface Props {
  onClose: () => void;
  onAdd: (wallet: string, role: number) => Promise<void>;
  onRemove: (wallet: string) => Promise<void>;
  loading: boolean;
}

const ROLES = [
  { value: 0, label: "Depositor", description: "Can deposit into vault" },
  { value: 1, label: "Transferrer", description: "Can deposit and transfer" },
  { value: 2, label: "Admin", description: "Full vault access" },
];

export default function WhitelistManager({ onClose, onAdd, onRemove, loading }: Props) {
  const [wallet, setWallet] = useState("");
  const [role, setRole] = useState(0);
  const [removeWallet, setRemoveWallet] = useState("");
  const [localError, setLocalError] = useState("");
  const [tab, setTab] = useState<"add" | "remove">("add");

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError("");

    if (!wallet || wallet.length < 32) {
      setLocalError("Enter a valid Solana address");
      return;
    }

    try {
      await onAdd(wallet, role);
      setWallet("");
    } catch (err: unknown) {
      setLocalError(err instanceof Error ? err.message : "Failed");
    }
  };

  const handleRemove = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError("");

    if (!removeWallet || removeWallet.length < 32) {
      setLocalError("Enter a valid Solana address");
      return;
    }

    try {
      await onRemove(removeWallet);
      setRemoveWallet("");
    } catch (err: unknown) {
      setLocalError(err instanceof Error ? err.message : "Failed");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-40 p-4">
      <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-2xl p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-white">Manage Whitelist</h3>
          <button onClick={onClose} className="text-[var(--muted)] hover:text-white text-xl">&times;</button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setTab("add")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === "add"
                ? "bg-[var(--accent)] text-white"
                : "bg-[var(--background)] text-[var(--muted)] hover:text-white"
            }`}
          >
            Add Wallet
          </button>
          <button
            onClick={() => setTab("remove")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === "remove"
                ? "bg-[var(--danger)] text-white"
                : "bg-[var(--background)] text-[var(--muted)] hover:text-white"
            }`}
          >
            Remove Wallet
          </button>
        </div>

        {tab === "add" ? (
          <form onSubmit={handleAdd} className="space-y-4">
            <div>
              <label className="block text-sm text-[var(--muted)] mb-1.5">Wallet Address</label>
              <input
                type="text"
                value={wallet}
                onChange={(e) => setWallet(e.target.value)}
                placeholder="Solana wallet address to whitelist"
                className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded-lg px-3 py-2.5 text-white text-sm font-mono placeholder:text-[var(--muted)]/50 focus:outline-none focus:border-[var(--accent)]"
              />
            </div>

            <div>
              <label className="block text-sm text-[var(--muted)] mb-1.5">Role</label>
              <div className="space-y-2">
                {ROLES.map((r) => (
                  <label
                    key={r.value}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      role === r.value
                        ? "border-[var(--accent)] bg-[var(--accent)]/10"
                        : "border-[var(--card-border)] bg-[var(--background)] hover:border-[var(--muted)]"
                    }`}
                  >
                    <input
                      type="radio"
                      name="role"
                      value={r.value}
                      checked={role === r.value}
                      onChange={() => setRole(r.value)}
                      className="accent-[var(--accent)]"
                    />
                    <div>
                      <p className="text-sm font-medium text-white">{r.label}</p>
                      <p className="text-xs text-[var(--muted)]">{r.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {localError && <p className="text-sm text-[var(--danger)]">{localError}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-xl font-medium transition-colors disabled:opacity-50"
            >
              {loading ? "Adding..." : "Add to Whitelist"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleRemove} className="space-y-4">
            <div>
              <label className="block text-sm text-[var(--muted)] mb-1.5">Wallet Address</label>
              <input
                type="text"
                value={removeWallet}
                onChange={(e) => setRemoveWallet(e.target.value)}
                placeholder="Wallet address to remove"
                className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded-lg px-3 py-2.5 text-white text-sm font-mono placeholder:text-[var(--muted)]/50 focus:outline-none focus:border-[var(--accent)]"
              />
            </div>

            {localError && <p className="text-sm text-[var(--danger)]">{localError}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-[var(--danger)] hover:bg-[var(--danger)]/80 text-white rounded-xl font-medium transition-colors disabled:opacity-50"
            >
              {loading ? "Removing..." : "Remove from Whitelist"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
