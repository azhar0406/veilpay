"use client";

import { useCallback, useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { formatEncryptedHandle, extractHandle, decryptHandle } from "@/lib/inco";
import { PaymentData } from "@/hooks/useVeilPay";

interface Props {
  fetchPayments: () => Promise<PaymentData[]>;
  canDecrypt?: boolean;
}

export default function PaymentHistory({ fetchPayments, canDecrypt = false }: Props) {
  const { publicKey, signMessage } = useWallet();
  const [payments, setPayments] = useState<PaymentData[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [revealedAmounts, setRevealedAmounts] = useState<Record<string, string>>({});
  const [revealingNonce, setRevealingNonce] = useState<string | null>(null);

  useEffect(() => {
    fetchPayments().then((data) => {
      setPayments(data.sort((a, b) => b.nonce.toNumber() - a.nonce.toNumber()));
      setLoaded(true);
    });
  }, [fetchPayments]);

  const handleRevealAmount = useCallback(async (nonce: string, handle: string) => {
    if (!publicKey || !signMessage) return;
    if (revealedAmounts[nonce]) {
      setRevealedAmounts((prev) => { const n = { ...prev }; delete n[nonce]; return n; });
      return;
    }
    setRevealingNonce(nonce);
    try {
      const result = await decryptHandle([handle], publicKey, signMessage);
      setRevealedAmounts((prev) => ({ ...prev, [nonce]: result.plaintexts[0] }));
    } catch {
      // silent
    } finally {
      setRevealingNonce(null);
    }
  }, [publicKey, signMessage, revealedAmounts]);

  if (!loaded) return null;

  return (
    <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-2xl p-6">
      <h3 className="text-lg font-bold text-white mb-4">Payment History</h3>

      {payments.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">No payments yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[var(--muted)] text-xs uppercase tracking-wider border-b border-[var(--card-border)]">
                <th className="text-left py-3 pr-4">Nonce</th>
                <th className="text-left py-3 pr-4">Sender</th>
                <th className="text-left py-3 pr-4">Recipient</th>
                <th className="text-left py-3 pr-4">Amount</th>
                <th className="text-left py-3">Time</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => {
                const nonce = p.nonce.toString();
                const handle = extractHandle(p.encryptedAmount);
                const isRevealed = !!revealedAmounts[nonce];
                const isLoading = revealingNonce === nonce;
                return (
                  <tr
                    key={nonce}
                    className="border-b border-[var(--card-border)]/50 hover:bg-[var(--background)]/50"
                  >
                    <td className="py-3 pr-4 font-mono">#{nonce}</td>
                    <td className="py-3 pr-4 font-mono text-xs">
                      {p.sender.toBase58().slice(0, 4)}...{p.sender.toBase58().slice(-4)}
                    </td>
                    <td className="py-3 pr-4 font-mono text-xs">
                      {p.recipient.toBase58().slice(0, 4)}...{p.recipient.toBase58().slice(-4)}
                    </td>
                    <td className="py-3 pr-4">
                      <div className="inline-flex items-center gap-2">
                        {isRevealed ? (
                          <span className="font-mono font-semibold" style={{ color: "#4ade80" }}>
                            &#128275; {revealedAmounts[nonce]}
                          </span>
                        ) : (
                          <span className="text-[var(--muted)]">
                            &#128274; {formatEncryptedHandle(handle)}
                          </span>
                        )}
                        {canDecrypt && (
                          <button
                            onClick={() => handleRevealAmount(nonce, handle)}
                            disabled={isLoading}
                            className="p-0.5 rounded hover:bg-white/5 transition-colors disabled:opacity-50"
                            title={isRevealed ? "Hide" : "Decrypt"}
                          >
                            {isLoading ? (
                              <span className="inline-block w-3.5 h-3.5 rounded-full animate-spin" style={{ border: "2px solid var(--card-border)", borderTopColor: "var(--accent)" }} />
                            ) : (
                              <span style={{ fontSize: "14px", cursor: "pointer" }}>
                                {isRevealed ? "\uD83D\uDC41\uFE0F" : "\uD83D\uDC41\u200D\uD83D\uDDE8\uFE0F"}
                              </span>
                            )}
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="py-3 text-[var(--muted)]">
                      {new Date(p.timestamp.toNumber() * 1000).toLocaleString()}
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
