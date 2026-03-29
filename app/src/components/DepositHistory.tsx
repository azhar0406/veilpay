"use client";

import { useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { USDC_MINT, USDT_MINT } from "@/lib/anchor";
import { VaultData } from "@/hooks/useVeilPay";

interface DepositEntry {
  signature: string;
  amount: number;
  timestamp: number;
  depositor: string;
}

interface Props {
  vaultPda: PublicKey;
  vault: VaultData;
  onMyTotalChange?: (total: number) => void;
}

function getTokenName(mint: PublicKey): string {
  if (mint.equals(USDC_MINT)) return "USDC";
  if (mint.equals(USDT_MINT)) return "USDT";
  return "Token";
}

function truncate(key: string): string {
  return key.slice(0, 4) + "..." + key.slice(-4);
}

export default function DepositHistory({ vaultPda, vault, onMyTotalChange }: Props) {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [deposits, setDeposits] = useState<DepositEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [myTotal, setMyTotal] = useState(0);
  const tokenName = getTokenName(vault.tokenMint);

  useEffect(() => {
    const fetchDeposits = async () => {
      setLoading(true);
      try {
        // Fetch recent transactions for the vault
        const sigs = await connection.getSignaturesForAddress(vaultPda, { limit: 50 }, "confirmed");
        const entries: DepositEntry[] = [];

        for (const sig of sigs) {
          try {
            const tx = await connection.getParsedTransaction(sig.signature, { maxSupportedTransactionVersion: 0 });
            if (!tx?.meta?.logMessages) continue;

            // Check if this is a deposit by looking for "Instruction: Deposit" in logs
            const isDeposit = tx.meta.logMessages.some(l => l.includes("Instruction: Deposit"));
            if (!isDeposit) continue;

            // Find the token transfer amount from inner instructions
            const innerInstructions = tx.meta.innerInstructions || [];
            for (const inner of innerInstructions) {
              for (const ix of inner.instructions) {
                const parsed = (ix as any).parsed;
                if (parsed?.type === "transferChecked" && parsed?.info) {
                  const amount = Number(parsed.info.tokenAmount?.uiAmount || 0);
                  const depositor = tx.transaction.message.accountKeys[0]?.pubkey?.toBase58() || "unknown";
                  if (amount > 0) {
                    entries.push({
                      signature: sig.signature,
                      amount,
                      timestamp: sig.blockTime || 0,
                      depositor,
                    });
                  }
                }
              }
            }
          } catch { /* skip failed tx parse */ }
        }

        setDeposits(entries);

        // Calculate my total
        if (publicKey) {
          const mine = entries.filter(d => d.depositor === publicKey.toBase58());
          const total = mine.reduce((sum, d) => sum + d.amount, 0);
          setMyTotal(total);
          onMyTotalChange?.(total);
        }
      } catch { /* ignore */ }
      finally { setLoading(false); }
    };

    fetchDeposits();
  }, [vaultPda, connection, publicKey]);

  return (
    <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-white">Deposit History</h3>
        {myTotal > 0 && (
          <span className="text-sm font-semibold" style={{ color: "#4ade80" }}>
            My Deposits: {myTotal} {tokenName}
          </span>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-[var(--muted)]">Loading deposits...</p>
      ) : deposits.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">No deposits yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[var(--muted)] text-xs uppercase tracking-wider border-b border-[var(--card-border)]">
                <th className="text-left py-3 pr-4">Depositor</th>
                <th className="text-left py-3 pr-4">Amount</th>
                <th className="text-left py-3 pr-4">Time</th>
                <th className="text-left py-3">Tx</th>
              </tr>
            </thead>
            <tbody>
              {deposits.map((d) => {
                const isMe = publicKey && d.depositor === publicKey.toBase58();
                return (
                  <tr key={d.signature} className="border-b border-[var(--card-border)]/50 hover:bg-[var(--background)]/50">
                    <td className="py-3 pr-4 font-mono text-xs">
                      <span className={isMe ? "text-[#4ade80]" : "text-white"}>
                        {isMe ? "You" : truncate(d.depositor)}
                      </span>
                    </td>
                    <td className="py-3 pr-4 font-mono font-semibold text-white">
                      {d.amount} {tokenName}
                    </td>
                    <td className="py-3 pr-4 text-[var(--muted)]">
                      {d.timestamp ? new Date(d.timestamp * 1000).toLocaleString() : "—"}
                    </td>
                    <td className="py-3">
                      <a
                        href={`https://explorer.solana.com/tx/${d.signature}?cluster=devnet`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-mono hover:underline"
                        style={{ color: "var(--accent)" }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {d.signature.slice(0, 8)}...
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
