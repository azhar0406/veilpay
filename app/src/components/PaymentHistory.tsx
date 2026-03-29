"use client";

import { useCallback, useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { formatEncryptedHandle, extractHandle, decryptHandle } from "@/lib/inco";
import { PaymentData } from "@/hooks/useVeilPay";
import { USDC_MINT, USDT_MINT } from "@/lib/anchor";

interface Props {
  fetchPayments: () => Promise<PaymentData[]>;
  canDecrypt?: boolean;
  isAuthority?: boolean;
  grantPaymentAccess?: (paymentPda: PublicKey, handle: bigint) => Promise<void>;
  claimPayment?: (paymentPda: PublicKey) => Promise<void>;
  connectedWallet?: PublicKey | null;
  refreshKey?: number;
  tokenMint?: PublicKey;
}

function truncate(key: string): string {
  return key.slice(0, 4) + "..." + key.slice(-4);
}

function decodeMemo(memo: number[]): string {
  const bytes = new Uint8Array(memo);
  // Find first zero byte
  let end = bytes.indexOf(0);
  if (end === -1) end = bytes.length;
  if (end === 0) return "";
  return new TextDecoder().decode(bytes.slice(0, end));
}

function formatAmount(amount: any, tokenMint?: PublicKey): string {
  const raw = typeof amount === "object" && amount.toNumber ? amount.toNumber() : Number(amount);
  if (raw === 0) return "0";
  const uiAmount = raw / 1_000_000;
  const name = tokenMint?.equals(USDC_MINT) ? "USDC" : tokenMint?.equals(USDT_MINT) ? "USDT" : "";
  return `${uiAmount} ${name}`.trim();
}

export default function PaymentHistory({ fetchPayments, canDecrypt = false, isAuthority = false, grantPaymentAccess, claimPayment, connectedWallet, refreshKey = 0, tokenMint }: Props) {
  const { publicKey, signMessage } = useWallet();
  const [payments, setPayments] = useState<PaymentData[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [revealedAmounts, setRevealedAmounts] = useState<Record<string, string>>({});
  const [revealingNonce, setRevealingNonce] = useState<string | null>(null);
  const [grantingNonce, setGrantingNonce] = useState<string | null>(null);
  const [claimingNonce, setClaimingNonce] = useState<string | null>(null);

  useEffect(() => {
    fetchPayments().then((data) => {
      setPayments(data.sort((a, b) => b.nonce.toNumber() - a.nonce.toNumber()));
      setLoaded(true);
    });
  }, [fetchPayments, refreshKey]);

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

  const handleClaim = useCallback(async (payment: PaymentData) => {
    if (!claimPayment || !payment.publicKey) return;
    const nonce = payment.nonce.toString();
    setClaimingNonce(nonce);
    try {
      await claimPayment(payment.publicKey);
      const data = await fetchPayments();
      setPayments(data.sort((a, b) => b.nonce.toNumber() - a.nonce.toNumber()));
    } catch { /* error handled by hook */ }
    finally { setClaimingNonce(null); }
  }, [claimPayment, fetchPayments]);

  if (!loaded) return null;

  return (
    <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-2xl p-6">
      <h3 className="text-lg font-bold text-white mb-4">Payment History</h3>

      {payments.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">No payments yet.</p>
      ) : (
        <div className="space-y-3">
          {payments.map((p) => {
            const nonce = p.nonce.toString();
            const handle = extractHandle(p.encryptedAmount);
            const revealed = revealedAmounts[nonce];
            const isRevealed = !!revealed && !revealed.startsWith("Not allowed") && !revealed.startsWith("Decrypt");
            const needsAccess = revealed?.startsWith("Not allowed");
            const isLoading = revealingNonce === nonce;
            const isGranting = grantingNonce === nonce;
            const isClaiming = claimingNonce === nonce;
            const isSettled = p.isSettled;
            const isRecipient = connectedWallet && p.recipient.equals(connectedWallet);
            const memo = p.memo ? decodeMemo(p.memo) : "";
            const amount = p.amount ? formatAmount(p.amount, tokenMint) : null;

            return (
              <div
                key={nonce}
                className="rounded-xl p-4"
                style={{
                  background: "var(--surface)",
                  border: `1px solid ${isRecipient && !isSettled ? "rgba(251,191,36,0.3)" : "var(--card-border)"}`,
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-[var(--muted)]">#{nonce}</span>
                    <span className="text-xs text-[var(--muted)]">
                      {truncate(p.sender.toBase58())} &rarr; {truncate(p.recipient.toBase58())}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {isSettled ? (
                      <span className="text-xs px-2 py-1 rounded-full font-semibold" style={{ background: "rgba(34,197,94,0.12)", color: "#4ade80" }}>
                        Claimed
                      </span>
                    ) : (
                      <span className="text-xs px-2 py-1 rounded-full font-semibold" style={{ background: "rgba(251,191,36,0.12)", color: "#fbbf24" }}>
                        Pending
                      </span>
                    )}
                  </div>
                </div>

                {/* Amount */}
                <div className="flex items-center gap-2 mb-1">
                  {amount ? (
                    <span className="text-sm font-mono font-semibold text-white">{amount}</span>
                  ) : (
                    <span className="text-sm text-[var(--muted)]">&#128274; {formatEncryptedHandle(handle)}</span>
                  )}
                  {canDecrypt && (
                    <button
                      onClick={() => handleRevealAmount(nonce, handle)}
                      disabled={isLoading}
                      className="p-0.5 rounded hover:bg-white/5 transition-colors disabled:opacity-50"
                      title={isRevealed ? "Hide" : "Decrypt encrypted amount"}
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
                      className="px-2 py-0.5 rounded text-xs font-semibold disabled:opacity-50"
                      style={{ background: "rgba(59,130,246,0.15)", color: "#60a5fa", border: "1px solid rgba(59,130,246,0.3)" }}
                    >
                      {isGranting ? "..." : "Grant Access"}
                    </button>
                  )}
                </div>

                {/* Memo */}
                {memo && (
                  <p className="text-xs mt-1 px-2 py-1.5 rounded-lg" style={{ background: "var(--background)", color: "var(--muted)" }}>
                    &#128172; {memo}
                  </p>
                )}

                {/* Timestamp */}
                <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>
                  {p.timestamp ? new Date(p.timestamp.toNumber() * 1000).toLocaleString() : ""}
                </p>

                {/* Claim button — only for recipient, one click */}
                {isRecipient && !isSettled && claimPayment && (
                  <button
                    onClick={() => handleClaim(p)}
                    disabled={isClaiming}
                    className="mt-3 w-full py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
                    style={{
                      background: "linear-gradient(135deg, #22c55e, #16a34a)",
                      color: "#fff",
                      boxShadow: "0 2px 12px rgba(34,197,94,0.25)",
                    }}
                  >
                    {isClaiming ? "Claiming..." : `Claim ${amount || ""}`}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
