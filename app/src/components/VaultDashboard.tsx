"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useVeilPay } from "@/hooks/useVeilPay";
import { formatEncryptedHandle, extractHandle } from "@/lib/inco";
import InitializeVaultModal from "./InitializeVaultModal";
import DepositModal from "./DepositModal";
import TransferModal from "./TransferModal";
import WhitelistManager from "./WhitelistManager";
import AuditorView from "./AuditorView";
import PaymentHistory from "./PaymentHistory";
import USXFaucet from "./USXFaucet";

export default function VaultDashboard() {
  const { connected, publicKey } = useWallet();
  const {
    vault,
    vaultPda,
    loading,
    error,
    initializeVault,
    deposit,
    transfer,
    toggleFreeze,
    addToWhitelist,
    removeFromWhitelist,
    fetchPayments,
  } = useVeilPay();

  const [showInit, setShowInit] = useState(false);
  const [showDeposit, setShowDeposit] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [showWhitelist, setShowWhitelist] = useState(false);

  const isAuthority = vault && publicKey && vault.authority.equals(publicKey);
  const isAuditor = vault && publicKey && vault.auditor.equals(publicKey);

  return (
    <div className="min-h-screen" style={{ background: "var(--background)" }}>
      {/* Header */}
      <header style={{ background: "var(--card)", borderBottom: "1px solid var(--card-border)" }}>
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img src="/logo.svg" alt="VeilPay" className="w-10 h-10" />
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">VeilPay</h1>
              <p style={{ color: "var(--muted)", fontSize: "12px", lineHeight: "1.2" }}>
                Confidential Treasury Payments
              </p>
            </div>
            <span
              className="text-xs px-2.5 py-1 rounded-full font-semibold ml-1"
              style={{ background: "rgba(59,130,246,0.15)", color: "#60a5fa" }}
            >
              DEVNET
            </span>
          </div>
          <WalletMultiButton />
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-10">
        {!connected ? (
          /* ===== LANDING / NOT CONNECTED ===== */
          <div className="flex flex-col items-center justify-center min-h-[65vh] gap-8">
            <img src="/logo.svg" alt="VeilPay" className="w-24 h-24" />

            <div className="text-center max-w-lg">
              <h2 className="text-3xl font-bold text-white mb-3 tracking-tight">
                Confidential Treasury Vault
              </h2>
              <p style={{ color: "var(--muted-light)", fontSize: "16px", lineHeight: "1.7" }}>
                Institutional-grade privacy for stablecoin payments on Solana.
                Balances and transfers are fully encrypted on-chain using Inco Lightning.
              </p>
            </div>

            <div
              className="grid grid-cols-3 gap-6 max-w-xl w-full mt-2"
            >
              {[
                { icon: "&#128274;", title: "Encrypted Balances", desc: "Vault balances hidden via FHE" },
                { icon: "&#128275;", title: "Auditor Access", desc: "Selective disclosure for compliance" },
                { icon: "&#9889;", title: "Spending Limits", desc: "Enforced on encrypted values" },
              ].map((f, i) => (
                <div
                  key={i}
                  className="text-center p-5 rounded-2xl"
                  style={{ background: "var(--card)", border: "1px solid var(--card-border)" }}
                >
                  <div className="text-2xl mb-2" dangerouslySetInnerHTML={{ __html: f.icon }} />
                  <p className="text-sm font-semibold text-white mb-1">{f.title}</p>
                  <p style={{ color: "var(--muted)", fontSize: "12px" }}>{f.desc}</p>
                </div>
              ))}
            </div>

            <p style={{ color: "var(--muted)", fontSize: "13px" }} className="mt-2">
              Connect your Phantom or Solflare wallet to get started
            </p>
          </div>
        ) : !vault ? (
          /* ===== CONNECTED BUT NO VAULT ===== */
          <div className="flex flex-col items-center justify-center min-h-[55vh] gap-8">
            <img src="/logo.svg" alt="VeilPay" className="w-20 h-20" />

            <div className="text-center max-w-md">
              <h2 className="text-2xl font-bold text-white mb-3 tracking-tight">
                No Vault Found
              </h2>
              <p style={{ color: "var(--muted-light)", fontSize: "15px", lineHeight: "1.6" }}>
                Create a confidential treasury vault to start managing encrypted payments.
                You&apos;ll set an auditor and a spending limit.
              </p>
            </div>

            <button
              onClick={() => setShowInit(true)}
              className="px-8 py-3.5 text-white rounded-xl font-semibold text-base transition-all hover:-translate-y-0.5"
              style={{
                background: "linear-gradient(135deg, #3b82f6, #2563eb)",
                boxShadow: "0 4px 20px rgba(59,130,246,0.3)",
              }}
            >
              Create Vault
            </button>

            <div
              className="max-w-md w-full p-4 rounded-xl text-sm"
              style={{
                background: "rgba(59,130,246,0.06)",
                border: "1px solid rgba(59,130,246,0.15)",
                color: "var(--muted-light)",
              }}
            >
              <p className="font-semibold text-white mb-2">Quick Start Guide:</p>
              <ol className="space-y-1.5" style={{ paddingLeft: "18px", listStyleType: "decimal" }}>
                <li>Create a vault (set an auditor wallet + spending limit)</li>
                <li>Whitelist wallets that can deposit & transfer</li>
                <li>Deposit encrypted amounts into the vault</li>
                <li>Send confidential transfers to recipients</li>
              </ol>
            </div>

            {/* USX Faucet — only visible to whitelisted wallet */}
            <div className="max-w-md w-full mt-2">
              <USXFaucet />
            </div>
          </div>
        ) : (
          /* ===== VAULT EXISTS — MAIN DASHBOARD ===== */
          <div className="space-y-6">
            {/* Error Banner */}
            {error && (
              <div
                className="px-5 py-3.5 rounded-xl text-sm font-medium"
                style={{
                  background: "rgba(239,68,68,0.08)",
                  border: "1px solid rgba(239,68,68,0.2)",
                  color: "#f87171",
                }}
              >
                {error}
              </div>
            )}

            {/* Vault Status Card */}
            <div
              className="rounded-2xl p-6"
              style={{ background: "var(--card)", border: "1px solid var(--card-border)" }}
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-bold text-white">Vault Overview</h2>
                  <span
                    className="text-xs px-3 py-1 rounded-full font-bold uppercase tracking-wider"
                    style={{
                      background: vault.isFrozen ? "rgba(239,68,68,0.12)" : "rgba(34,197,94,0.12)",
                      color: vault.isFrozen ? "#f87171" : "#4ade80",
                    }}
                  >
                    {vault.isFrozen ? "FROZEN" : "ACTIVE"}
                  </span>
                </div>
                {isAuthority && (
                  <button
                    onClick={toggleFreeze}
                    disabled={loading}
                    className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
                    style={{
                      background: vault.isFrozen ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
                      color: vault.isFrozen ? "#4ade80" : "#f87171",
                    }}
                  >
                    {vault.isFrozen ? "Unfreeze Vault" : "Freeze Vault"}
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { label: "Vault Balance", value: extractHandle(vault.encryptedBalance), sub: "Encrypted via Inco Lightning" },
                  { label: "Spending Limit", value: extractHandle(vault.encryptedSpendingLimit), sub: "Per-epoch encrypted limit" },
                  { label: "Epoch Spent", value: extractHandle(vault.encryptedSpentThisEpoch), sub: `Epoch ${vault.currentEpoch.toString()}` },
                ].map((item, i) => (
                  <div
                    key={i}
                    className="rounded-xl p-4"
                    style={{ background: "var(--surface)", border: "1px solid var(--card-border)" }}
                  >
                    <p style={{ color: "var(--muted)", fontSize: "11px", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "6px" }}>
                      {item.label}
                    </p>
                    <div className="flex items-center gap-2">
                      <span style={{ fontSize: "16px" }}>&#128274;</span>
                      <span className="text-lg font-mono text-white font-semibold">
                        {formatEncryptedHandle(item.value)}
                      </span>
                    </div>
                    <p style={{ color: "var(--muted)", fontSize: "11px", marginTop: "4px" }}>{item.sub}</p>
                  </div>
                ))}
              </div>

              {/* Vault Details */}
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                {[
                  { label: "Authority", value: vault.authority.toBase58() },
                  { label: "Auditor", value: vault.auditor.toBase58() },
                ].map((item, i) => (
                  <div
                    key={i}
                    className="rounded-xl p-3.5"
                    style={{ background: "var(--surface)", border: "1px solid var(--card-border)" }}
                  >
                    <p style={{ color: "var(--muted)", fontSize: "11px", marginBottom: "4px" }}>{item.label}</p>
                    <p className="text-sm font-mono text-white truncate">{item.value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { icon: "&#8595;", label: "Deposit", onClick: () => setShowDeposit(true), disabled: loading || vault.isFrozen },
                { icon: "&#8594;", label: "Transfer", onClick: () => setShowTransfer(true), disabled: loading || vault.isFrozen },
                ...(isAuthority ? [{ icon: "&#128101;", label: "Whitelist", onClick: () => setShowWhitelist(true), disabled: false }] : []),
                { icon: "&#128270;", label: "Explorer", onClick: () => window.open(`https://explorer.solana.com/address/${vaultPda?.toBase58()}?cluster=devnet`, "_blank"), disabled: false },
              ].map((btn, i) => (
                <button
                  key={i}
                  onClick={btn.onClick}
                  disabled={btn.disabled}
                  className="rounded-xl p-5 text-center transition-all hover:-translate-y-0.5 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                  style={{
                    background: "var(--card)",
                    border: "1px solid var(--card-border)",
                  }}
                >
                  <div className="text-2xl mb-2" dangerouslySetInnerHTML={{ __html: btn.icon }} />
                  <div className="font-semibold text-sm text-white">{btn.label}</div>
                </button>
              ))}
            </div>

            {/* USX Faucet — only visible to whitelisted wallet */}
            <USXFaucet />

            {/* Auditor View */}
            {isAuditor && vault && vaultPda && (
              <AuditorView vault={vault} vaultPda={vaultPda} />
            )}

            {/* Payment History */}
            {vault && <PaymentHistory fetchPayments={fetchPayments} />}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-auto py-6 text-center" style={{ color: "var(--muted)", fontSize: "12px" }}>
        <p>VeilPay &mdash; Confidential Programmable Stablecoin Payments on Solana</p>
        <p className="mt-1">Powered by Inco Lightning SVM &bull; StableHacks 2026</p>
      </footer>

      {/* Modals */}
      {showInit && (
        <InitializeVaultModal
          onClose={() => setShowInit(false)}
          onSubmit={initializeVault}
          loading={loading}
        />
      )}
      {showDeposit && (
        <DepositModal
          onClose={() => setShowDeposit(false)}
          onSubmit={deposit}
          loading={loading}
        />
      )}
      {showTransfer && (
        <TransferModal
          onClose={() => setShowTransfer(false)}
          onSubmit={transfer}
          loading={loading}
        />
      )}
      {showWhitelist && vaultPda && (
        <WhitelistManager
          onClose={() => setShowWhitelist(false)}
          onAdd={addToWhitelist}
          onRemove={removeFromWhitelist}
          loading={loading}
        />
      )}

      {/* Loading overlay */}
      {loading && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(6px)" }}>
          <div
            className="rounded-2xl p-6 flex items-center gap-4"
            style={{ background: "var(--card)", border: "1px solid var(--card-border)" }}
          >
            <div
              className="w-6 h-6 rounded-full animate-spin"
              style={{ border: "2.5px solid var(--card-border)", borderTopColor: "var(--accent)" }}
            />
            <span className="text-white font-semibold">Processing transaction...</span>
          </div>
        </div>
      )}
    </div>
  );
}
