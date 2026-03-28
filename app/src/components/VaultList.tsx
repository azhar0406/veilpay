"use client";

import { useEffect, useState } from "react";
import { PublicKey, Connection } from "@solana/web3.js";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { VaultData, VaultListItem } from "@/hooks/useVeilPay";
import { USDC_MINT, USDT_MINT, getWhitelistPda } from "@/lib/anchor";

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

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

async function fetchCreationTime(connection: Connection, pubkey: PublicKey): Promise<Date | null> {
  try {
    const sigs = await connection.getSignaturesForAddress(pubkey, { limit: 1 }, "confirmed");
    if (sigs.length > 0 && sigs[0].blockTime) {
      return new Date(sigs[0].blockTime * 1000);
    }
  } catch { /* ignore */ }
  return null;
}

type VaultRole = "authority" | "auditor" | "whitelisted" | "none";

export default function VaultList({ vaults, onSelect, onCreate, loading }: Props) {
  const { publicKey } = useWallet();
  const { connection } = useConnection();
  const [creationTimes, setCreationTimes] = useState<Record<string, Date>>({});
  const [roles, setRoles] = useState<Record<string, VaultRole>>({});

  // Fetch creation times for each vault
  useEffect(() => {
    vaults.forEach((v) => {
      const key = v.publicKey.toBase58();
      if (!creationTimes[key]) {
        fetchCreationTime(connection, v.publicKey).then((time) => {
          if (time) setCreationTimes((prev) => ({ ...prev, [key]: time }));
        });
      }
    });
  }, [vaults, connection]);

  // Detect role for connected wallet in each vault
  useEffect(() => {
    if (!publicKey) return;
    const program = vaults; // just need vault data
    program.forEach(async (v) => {
      const key = v.publicKey.toBase58();
      if (v.data.authority.equals(publicKey)) {
        setRoles((prev) => ({ ...prev, [key]: "authority" }));
      } else if (v.data.auditor.equals(publicKey)) {
        setRoles((prev) => ({ ...prev, [key]: "auditor" }));
      } else {
        // Check whitelist
        const [whitelistPda] = getWhitelistPda(v.publicKey, publicKey);
        try {
          await connection.getAccountInfo(whitelistPda).then((info) => {
            if (info) setRoles((prev) => ({ ...prev, [key]: "whitelisted" }));
            else setRoles((prev) => ({ ...prev, [key]: "none" }));
          });
        } catch {
          setRoles((prev) => ({ ...prev, [key]: "none" }));
        }
      }
    });
  }, [vaults, publicKey, connection]);

  const roleLabel: Record<VaultRole, { text: string; color: string; bg: string }> = {
    authority: { text: "Your Vault", color: "#4ade80", bg: "rgba(34,197,94,0.12)" },
    auditor: { text: "Auditor", color: "#60a5fa", bg: "rgba(59,130,246,0.12)" },
    whitelisted: { text: "Member", color: "#fbbf24", bg: "rgba(251,191,36,0.12)" },
    none: { text: "", color: "", bg: "" },
  };

  // Sort: own vaults first, then by role, then by creation time
  const sorted = [...vaults].sort((a, b) => {
    const roleOrder: Record<VaultRole, number> = { authority: 0, auditor: 1, whitelisted: 2, none: 3 };
    const ra = roles[a.publicKey.toBase58()] || "none";
    const rb = roles[b.publicKey.toBase58()] || "none";
    if (roleOrder[ra] !== roleOrder[rb]) return roleOrder[ra] - roleOrder[rb];
    const ta = creationTimes[a.publicKey.toBase58()]?.getTime() || 0;
    const tb = creationTimes[b.publicKey.toBase58()]?.getTime() || 0;
    return tb - ta; // newest first
  });

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
          {sorted.map((v) => {
            const key = v.publicKey.toBase58();
            const role = roles[key] || "none";
            const rl = roleLabel[role];
            const created = creationTimes[key];
            const isOwn = role === "authority";
            return (
              <button
                key={key}
                onClick={() => onSelect(v.publicKey, v.data)}
                disabled={loading}
                className="text-left rounded-2xl p-5 transition-all hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-50"
                style={{
                  background: "var(--card)",
                  border: isOwn ? "1.5px solid rgba(34,197,94,0.4)" : "1px solid var(--card-border)",
                }}
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
                  {rl.text && (
                    <span
                      className="text-xs px-2.5 py-1 rounded-full font-semibold"
                      style={{ background: rl.bg, color: rl.color }}
                    >
                      {rl.text}
                    </span>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span style={{ color: "var(--muted)" }}>Vault</span>
                    <span className="font-mono text-white">{truncate(key)}</span>
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
                  <div className="flex justify-between text-xs">
                    <span style={{ color: "var(--muted)" }}>Created</span>
                    <span className="text-white">
                      {created ? timeAgo(created) : "..."}
                    </span>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between">
                  {isOwn && (
                    <span className="text-xs" style={{ color: "var(--muted)" }}>
                      You own this vault
                    </span>
                  )}
                  <span className="text-xs font-semibold ml-auto" style={{ color: "var(--accent)" }}>
                    Enter Vault &rarr;
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
