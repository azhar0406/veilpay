"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { decryptHandle, extractHandle } from "@/lib/inco";
import { VaultData } from "@/hooks/useVeilPay";

interface Props {
  vault: VaultData;
  vaultPda: PublicKey;
}

export default function AuditorView({ vault }: Props) {
  const wallet = useWallet();
  const [decryptedBalance, setDecryptedBalance] = useState<string | null>(null);
  const [decryptedLimit, setDecryptedLimit] = useState<string | null>(null);
  const [decryptedSpent, setDecryptedSpent] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [decryptError, setDecryptError] = useState<string | null>(null);

  const handleReveal = async () => {
    if (!wallet.publicKey || !wallet.signMessage) return;
    setRevealing(true);
    setDecryptError(null);

    try {
      const handles = [
        extractHandle(vault.encryptedBalance),
        extractHandle(vault.encryptedSpendingLimit),
        extractHandle(vault.encryptedSpentThisEpoch),
      ];

      console.log("Decrypting handles:", handles);

      const result = await decryptHandle(
        handles,
        wallet.publicKey,
        wallet.signMessage
      );

      if (result.error) {
        setDecryptError(result.error);
      }

      setDecryptedBalance(result.plaintexts[0]);
      setDecryptedLimit(result.plaintexts[1]);
      setDecryptedSpent(result.plaintexts[2]);
    } catch (err) {
      console.error("Decryption failed:", err);
      setDecryptError(err instanceof Error ? err.message : "Decryption failed");
    } finally {
      setRevealing(false);
    }
  };

  return (
    <div
      className="rounded-2xl p-6"
      style={{ background: "var(--card)", border: "1px solid rgba(59,130,246,0.3)" }}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-lg">&#128373;</span>
          <h3 className="text-lg font-bold text-white">Auditor View</h3>
          <span
            className="text-xs px-2 py-0.5 rounded-full"
            style={{ background: "rgba(59,130,246,0.15)", color: "#60a5fa" }}
          >
            Selective Disclosure
          </span>
        </div>
        <button
          onClick={handleReveal}
          disabled={revealing}
          className="px-4 py-2 text-white rounded-lg text-sm font-semibold transition-all disabled:opacity-50"
          style={{
            background: "linear-gradient(135deg, #3b82f6, #2563eb)",
          }}
        >
          {revealing ? "Decrypting..." : decryptedBalance ? "Refresh" : "Reveal Balances"}
        </button>
      </div>

      {decryptError && (
        <div
          className="mb-4 p-3 rounded-xl text-sm"
          style={{
            background: "rgba(245,158,11,0.08)",
            border: "1px solid rgba(245,158,11,0.2)",
            color: "#fbbf24",
          }}
        >
          <p className="font-semibold mb-1">Inco Covalidator Response:</p>
          <p className="text-xs" style={{ color: "#d4a017" }}>{decryptError}</p>
          <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>
            Note: Decryption requires the Inco covalidator network to be active on devnet.
            If this is a beta limitation, the handles above are the on-chain proof of encrypted data.
          </p>
        </div>
      )}

      {decryptedBalance !== null ? (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Vault Balance", value: decryptedBalance },
            { label: "Spending Limit", value: decryptedLimit },
            { label: "Epoch Spent", value: decryptedSpent },
          ].map((item, i) => (
            <div
              key={i}
              className="rounded-xl p-4"
              style={{
                background: "var(--surface)",
                border: `1px solid ${decryptError ? "rgba(245,158,11,0.2)" : "rgba(34,197,94,0.3)"}`,
              }}
            >
              <p style={{ color: "var(--muted)", fontSize: "11px", marginBottom: "4px" }}>
                {item.label}
              </p>
              <div className="flex items-center gap-2">
                <span>{decryptError ? "\u{1F512}" : "\u{1F513}"}</span>
                <span
                  className="text-xl font-bold"
                  style={{ color: decryptError ? "#fbbf24" : "#4ade80" }}
                >
                  {item.value}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          As the designated auditor, you can decrypt vault balances and payment amounts
          for compliance review. Click &quot;Reveal Balances&quot; to decrypt via Inco&apos;s attested reveal.
        </p>
      )}
    </div>
  );
}
