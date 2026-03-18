"use client";

import { useEffect, useState } from "react";
import { formatEncryptedHandle, extractHandle } from "@/lib/inco";
import { PaymentData } from "@/hooks/useVeilPay";

interface Props {
  fetchPayments: () => Promise<PaymentData[]>;
}

export default function PaymentHistory({ fetchPayments }: Props) {
  const [payments, setPayments] = useState<PaymentData[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetchPayments().then((data) => {
      setPayments(data.sort((a, b) => b.nonce.toNumber() - a.nonce.toNumber()));
      setLoaded(true);
    });
  }, [fetchPayments]);

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
              {payments.map((p) => (
                <tr
                  key={p.nonce.toString()}
                  className="border-b border-[var(--card-border)]/50 hover:bg-[var(--background)]/50"
                >
                  <td className="py-3 pr-4 font-mono">#{p.nonce.toString()}</td>
                  <td className="py-3 pr-4 font-mono text-xs">
                    {p.sender.toBase58().slice(0, 4)}...{p.sender.toBase58().slice(-4)}
                  </td>
                  <td className="py-3 pr-4 font-mono text-xs">
                    {p.recipient.toBase58().slice(0, 4)}...{p.recipient.toBase58().slice(-4)}
                  </td>
                  <td className="py-3 pr-4">
                    <span className="inline-flex items-center gap-1 text-[var(--muted)]">
                      &#128274; {formatEncryptedHandle(extractHandle(p.encryptedAmount))}
                    </span>
                  </td>
                  <td className="py-3 text-[var(--muted)]">
                    {new Date(p.timestamp.toNumber() * 1000).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
