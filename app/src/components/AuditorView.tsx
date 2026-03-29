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

    const labels = ["Balance", "Spending Limit", "Epoch Spent"];
    const handles = [
      extractHandle(vault.encryptedBalance),
      extractHandle(vault.encryptedSpendingLimit),
      extractHandle(vault.encryptedSpentThisEpoch),
    ];
    const setters = [setDecryptedBalance, setDecryptedLimit, setDecryptedSpent];
    const errors: string[] = [];

    // Decrypt each handle individually so partial results work
    for (let i = 0; i < handles.length; i++) {
      try {
        const result = await decryptHandle([handles[i]], wallet.publicKey, wallet.signMessage);
        if (result.error) {
          errors.push(`${labels[i]}: ${result.error}`);
          setters[i](result.plaintexts[0]);
        } else {
          setters[i](result.plaintexts[0]);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${labels[i]}: ${msg}`);
        setters[i]("N/A");
      }
    }

    if (errors.length > 0) {
      setDecryptError(errors.join("\n"));
    }

    setRevealing(false);
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
          <p className="font-semibold mb-1">Partial decryption:</p>
          <p className="text-xs whitespace-pre-line" style={{ color: "#d4a017" }}>{decryptError}</p>
          <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>
            Some handles may need &quot;Grant Access&quot; to be clicked first by the authority.
          </p>
        </div>
      )}

      {decryptedBalance !== null ? (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Vault Balance", value: decryptedBalance },
            { label: "Spending Limit", value: decryptedLimit },
            { label: "Epoch Spent", value: decryptedSpent },
          ].map((item, i) => {
            const isNA = item.value === "N/A";
            return (
              <div
                key={i}
                className="rounded-xl p-4"
                style={{
                  background: "var(--surface)",
                  border: `1px solid ${isNA ? "rgba(245,158,11,0.2)" : "rgba(34,197,94,0.3)"}`,
                }}
              >
                <p style={{ color: "var(--muted)", fontSize: "11px", marginBottom: "4px" }}>
                  {item.label}
                </p>
                <div className="flex items-center gap-2">
                  <span>{isNA ? "\u{1F512}" : "\u{1F513}"}</span>
                  <span
                    className="text-xl font-bold"
                    style={{ color: isNA ? "#fbbf24" : "#4ade80" }}
                  >
                    {item.value}
                  </span>
                </div>
              </div>
            );
          })}
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
