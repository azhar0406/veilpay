"use client";

import { PublicKey } from "@solana/web3.js";
import { useWallet } from "@solana/wallet-adapter-react";
import { VaultData, VaultListItem } from "@/hooks/useVeilPay";
import { USDC_MINT, USDT_MINT } from "@/lib/anchor";

interface Props {
  vaults: VaultListItem[];
  onSelect: (pda: PublicKey, data: VaultData) => void;
  onCreate: () => void;
  loading: boolean;
}

function getTokenName(mint: PublicKey): string {
  if (mint.equals(USDC_MINT)) return "USDC";
  if (mint.equals(USDT_MINT)) return "USDT";
  return mint.toBase58().slice(0, 6) + "...";
}

function truncate(key: string): string {
  return key.slice(0, 4) + "..." + key.slice(-4);
}

export default function VaultList({ vaults, onSelect, onCreate, loading }: Props) {
  const { publicKey } = useWallet();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">All Vaults</h2>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            {vaults.length} vault{vaults.length !== 1 ? "s" : ""} found on-chain
          </p>
        </div>
        <button
          onClick={onCreate}
          className="px-5 py-2.5 text-white rounded-xl font-semibold text-sm transition-all hover:-translate-y-0.5"
          style={{
            background: "linear-gradient(135deg, #3b82f6, #2563eb)",
            boxShadow: "0 4px 20px rgba(59,130,246,0.3)",
          }}
        >
          + Create Vault
        </button>
      </div>

      {vaults.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-lg text-white font-semibold mb-2">No vaults yet</p>
          <p style={{ color: "var(--muted)" }} className="text-sm">Be the first to create a confidential treasury vault.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {vaults.map((v) => {
            const isAuthority = publicKey && v.data.authority.equals(publicKey);
            const isAuditor = publicKey && v.data.auditor.equals(publicKey);
            return (
              <button
                key={v.publicKey.toBase58()}
                onClick={() => onSelect(v.publicKey, v.data)}
                disabled={loading}
                className="text-left rounded-2xl p-5 transition-all hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-50"
                style={{ background: "var(--card)", border: "1px solid var(--card-border)" }}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span
                      className="text-xs px-2.5 py-1 rounded-full font-bold"
                      style={{
                        background: v.data.isFrozen ? "rgba(239,68,68,0.12)" : "rgba(34,197,94,0.12)",
                        color: v.data.isFrozen ? "#f87171" : "#4ade80",
                      }}
                    >
                      {v.data.isFrozen ? "FROZEN" : "ACTIVE"}
                    </span>
                    <span
                      className="text-xs px-2.5 py-1 rounded-full font-semibold"
                      style={{ background: "rgba(59,130,246,0.12)", color: "#60a5fa" }}
                    >
                      {getTokenName(v.data.tokenMint)}
                    </span>
                  </div>
                  {(isAuthority || isAuditor) && (
                    <span className="text-xs font-semibold" style={{ color: "var(--accent)" }}>
                      {isAuthority ? "Your Vault" : "Auditor"}
                    </span>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span style={{ color: "var(--muted)" }}>Vault</span>
                    <span className="font-mono text-white">{truncate(v.publicKey.toBase58())}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span style={{ color: "var(--muted)" }}>Authority</span>
                    <span className="font-mono text-white">{truncate(v.data.authority.toBase58())}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span style={{ color: "var(--muted)" }}>Auditor</span>
                    <span className="font-mono text-white">{truncate(v.data.auditor.toBase58())}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span style={{ color: "var(--muted)" }}>Payments</span>
                    <span className="font-mono text-white">{v.data.paymentNonce.toString()}</span>
                  </div>
                </div>

                <div className="mt-3 text-xs text-right" style={{ color: "var(--accent)" }}>
                  Enter Vault &rarr;
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
