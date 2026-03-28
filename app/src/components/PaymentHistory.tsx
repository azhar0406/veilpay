"use client";

import { useCallback, useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { formatEncryptedHandle, extractHandle, decryptHandle } from "@/lib/inco";
import { PaymentData } from "@/hooks/useVeilPay";

interface Props {
  fetchPayments: () => Promise<PaymentData[]>;
  canDecrypt?: boolean;
  isAuthority?: boolean;
  grantPaymentAccess?: (paymentPda: PublicKey, handle: bigint) => Promise<void>;
  settlePayment?: (paymentPda: PublicKey, recipient: PublicKey, amount: number) => Promise<void>;
}

export default function PaymentHistory({ fetchPayments, canDecrypt = false, isAuthority = false, grantPaymentAccess, settlePayment }: Props) {
  const { publicKey, signMessage } = useWallet();
  const [payments, setPayments] = useState<PaymentData[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [revealedAmounts, setRevealedAmounts] = useState<Record<string, string>>({});
  const [revealingNonce, setRevealingNonce] = useState<string | null>(null);
  const [grantingNonce, setGrantingNonce] = useState<string | null>(null);
  const [settlingNonce, setSettlingNonce] = useState<string | null>(null);

  useEffect(() => {
    fetchPayments().then((data) => {
      setPayments(data.sort((a, b) => b.nonce.toNumber() - a.nonce.toNumber()));
      setLoaded(true);
    });
  }, [fetchPayments]);

  // Clear revealed amounts when wallet changes
  useEffect(() => {
    setRevealedAmounts({});
    setRevealingNonce(null);
  }, [publicKey]);

  const handleRevealAmount = useCallback(async (nonce: string, handle: string) => {
    if (!publicKey || !signMessage) return;
    if (revealedAmounts[nonce]) {
      setRevealedAmounts((prev) => { const n = { ...prev }; delete n[nonce]; return n; });
      return;
    }
    setRevealingNonce(nonce);
    try {
      const result = await decryptHandle([handle], publicKey, signMessage);
      if (result.error) {
        setRevealedAmounts((prev) => ({ ...prev, [nonce]: "Not allowed - Grant access first" }));
      } else {
        setRevealedAmounts((prev) => ({ ...prev, [nonce]: result.plaintexts[0] }));
      }
    } catch {
      setRevealedAmounts((prev) => ({ ...prev, [nonce]: "Decrypt failed" }));
    } finally {
      setRevealingNonce(null);
    }
  }, [publicKey, signMessage, revealedAmounts]);

  const handleGrantAccess = useCallback(async (payment: PaymentData) => {
    if (!grantPaymentAccess || !payment.publicKey) return;
    const handle = extractHandle(payment.encryptedAmount);
    const nonce = payment.nonce.toString();
    setGrantingNonce(nonce);
    try {
      await grantPaymentAccess(payment.publicKey, BigInt(handle));
      setRevealedAmounts((prev) => { const n = { ...prev }; delete n[nonce]; return n; });
    } catch { /* error handled by hook */ }
    finally { setGrantingNonce(null); }
  }, [grantPaymentAccess]);

  const handleSettle = useCallback(async (payment: PaymentData) => {
    if (!settlePayment || !payment.publicKey) return;
    const nonce = payment.nonce.toString();
    const revealed = revealedAmounts[nonce];
    if (!revealed || revealed.startsWith("Not allowed") || revealed.startsWith("Decrypt") || revealed === "N/A") {
      return; // Must decrypt first
    }
    // Convert decrypted raw units to token amount (the settle expects raw units with 6 decimals)
    const rawAmount = Number(revealed);
    setSettlingNonce(nonce);
    try {
      await settlePayment(payment.publicKey, payment.recipient, rawAmount);
      // Refresh payments
      const data = await fetchPayments();
      setPayments(data.sort((a, b) => b.nonce.toNumber() - a.nonce.toNumber()));
    } catch { /* error handled by hook */ }
    finally { setSettlingNonce(null); }
  }, [settlePayment, revealedAmounts, fetchPayments]);

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
                <th className="text-left py-3 pr-4">Status</th>
                <th className="text-left py-3">Time</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => {
                const nonce = p.nonce.toString();
                const handle = extractHandle(p.encryptedAmount);
                const revealed = revealedAmounts[nonce];
                const isRevealed = !!revealed && !revealed.startsWith("Not allowed") && !revealed.startsWith("Decrypt");
                const needsAccess = revealed?.startsWith("Not allowed");
                const isLoading = revealingNonce === nonce;
                const isGranting = grantingNonce === nonce;
                const isSettling = settlingNonce === nonce;
                const isSettled = p.isSettled;
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
                            &#128275; {revealed}
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
                        {needsAccess && isAuthority && grantPaymentAccess && (
                          <button
                            onClick={() => handleGrantAccess(p)}
                            disabled={isGranting}
                            className="px-2 py-0.5 rounded text-xs font-semibold transition-colors disabled:opacity-50"
                            style={{ background: "rgba(59,130,246,0.15)", color: "#60a5fa", border: "1px solid rgba(59,130,246,0.3)" }}
                          >
                            {isGranting ? "Granting..." : "Grant Access"}
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      {isSettled ? (
                        <span className="text-xs px-2 py-1 rounded-full font-semibold" style={{ background: "rgba(34,197,94,0.12)", color: "#4ade80" }}>
                          Settled
                        </span>
                      ) : isAuthority && isRevealed && settlePayment ? (
                        <button
                          onClick={() => handleSettle(p)}
                          disabled={isSettling}
                          className="px-3 py-1 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                          style={{ background: "rgba(251,191,36,0.15)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.3)" }}
                        >
                          {isSettling ? "Settling..." : "Settle"}
                        </button>
                      ) : (
                        <span className="text-xs px-2 py-1 rounded-full font-semibold" style={{ background: "rgba(251,191,36,0.12)", color: "#fbbf24" }}>
                          Pending
                        </span>
                      )}
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
