"use client";

import { useCallback, useEffect, useState } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";

const WHITELISTED_WALLET = "EHq49A6KfUccJJJHZxBiu8TavDgAUmzyFK7xe4YduCWJ";

const TOKENS = [
  {
    symbol: "USDG",
    mint: "HLwjxqGBrZPN7hehv7e9RXnqBr4AHJ9YMczFpw9AZu7r",
    color: "#8b5cf6",
    programId: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
  },
  {
    symbol: "USDC",
    mint: "8iBux2LRja1PhVZph8Rw4Hi45pgkaufNEiaZma5nTD5g",
    color: "#2775ca",
    programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  },
  {
    symbol: "USDT",
    mint: "5dXXpWyZCCPhBHxmp79Du81t7t9oh7HacUW864ARFyft",
    color: "#26a17b",
    programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  },
];

interface TokenBalance {
  symbol: string;
  mint: string;
  balance: number;
  decimals: number;
  color: string;
}

export default function USXFaucet() {
  const { publicKey } = useWallet();
  const { connection } = useConnection();
  const [balances, setBalances] = useState<TokenBalance[]>([]);
  const [loading, setLoading] = useState(false);
  const [solBalance, setSolBalance] = useState<number | null>(null);

  // Only show for the whitelisted wallet
  if (!publicKey || publicKey.toBase58() !== WHITELISTED_WALLET) {
    return null;
  }

  const fetchBalances = useCallback(async () => {
    if (!publicKey) return;
    setLoading(true);

    try {
      // Fetch SOL balance
      const sol = await connection.getBalance(publicKey);
      setSolBalance(sol / 1e9);

      // Fetch token accounts from both SPL Token and Token-2022
      const balanceMap = new Map<string, { amount: number; decimals: number }>();
      const programIds = [
        new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
        new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"),
      ];
      for (const pid of programIds) {
        try {
          const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
            publicKey,
            { programId: pid }
          );
          for (const account of tokenAccounts.value) {
            const info = account.account.data.parsed.info;
            balanceMap.set(info.mint, {
              amount: info.tokenAmount.uiAmount ?? 0,
              decimals: info.tokenAmount.decimals,
            });
          }
        } catch {
          // Program may not exist on this cluster
        }
      }

      const result: TokenBalance[] = TOKENS.map((t) => {
        const bal = balanceMap.get(t.mint);
        return {
          symbol: t.symbol,
          mint: t.mint,
          balance: bal?.amount ?? 0,
          decimals: bal?.decimals ?? 6,
          color: t.color,
        };
      });

      setBalances(result);
    } catch (err) {
      console.error("Failed to fetch balances:", err);
    } finally {
      setLoading(false);
    }
  }, [publicKey, connection]);

  useEffect(() => {
    fetchBalances();
  }, [fetchBalances]);

  const totalStablecoin = balances
    .reduce((sum, b) => sum + b.balance, 0);

  return (
    <div
      className="rounded-2xl p-6"
      style={{
        background: "var(--card)",
        border: "1px solid var(--card-border)",
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{
            background: "linear-gradient(135deg, rgba(34,197,94,0.15), rgba(59,130,246,0.15))",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="1" x2="12" y2="23" />
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          </svg>
        </div>
        <div>
          <h3 className="text-base font-bold text-white">Treasury Wallet</h3>
          <p style={{ color: "var(--muted)", fontSize: "12px" }}>
            Devnet USDG, USDC &amp; USDT balances
          </p>
        </div>
        <button
          onClick={fetchBalances}
          disabled={loading}
          className="ml-auto text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors disabled:opacity-50"
          style={{
            background: "rgba(59,130,246,0.12)",
            color: "#60a5fa",
          }}
        >
          {loading ? "..." : "Refresh"}
        </button>
      </div>

      {/* SOL Balance */}
      {solBalance !== null && (
        <div
          className="rounded-xl p-3.5 mb-3"
          style={{
            background: "linear-gradient(135deg, rgba(153,69,255,0.08), rgba(20,241,149,0.08))",
            border: "1px solid rgba(153,69,255,0.15)",
          }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                style={{ background: "linear-gradient(135deg, #9945FF, #14F195)", color: "#fff" }}
              >
                S
              </div>
              <div>
                <p className="text-sm font-semibold text-white">SOL</p>
                <p style={{ color: "var(--muted)", fontSize: "11px" }}>Native</p>
              </div>
            </div>
            <p className="text-base font-mono font-bold text-white">
              {solBalance.toFixed(4)}
            </p>
          </div>
        </div>
      )}

      {/* Token Balances */}
      <div className="space-y-2">
        {balances.map((token) => (
          <div
            key={token.mint}
            className="rounded-xl p-3.5"
            style={{
              background: "var(--surface)",
              border: `1px solid ${token.balance > 0 ? token.color + "25" : "var(--card-border)"}`,
            }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white"
                  style={{ background: token.color }}
                >
                  {token.symbol[0]}
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">{token.symbol}</p>
                  <p
                    className="font-mono"
                    style={{ color: "var(--muted)", fontSize: "11px" }}
                  >
                    {token.mint.slice(0, 4)}...{token.mint.slice(-4)}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p
                  className="text-base font-mono font-bold"
                  style={{ color: token.balance > 0 ? "#fff" : "var(--muted)" }}
                >
                  {token.balance.toLocaleString()}
                </p>
                {token.balance > 0 && (
                  <p style={{ color: token.color, fontSize: "11px", fontWeight: 600 }}>
                    Available
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Total */}
      <div
        className="mt-3 rounded-xl p-3.5"
        style={{
          background: "linear-gradient(135deg, rgba(59,130,246,0.08), rgba(139,92,246,0.08))",
          border: "1px solid rgba(59,130,246,0.15)",
        }}
      >
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
            Total Stablecoin Collateral
          </p>
          <p className="text-lg font-mono font-bold text-white">
            ${totalStablecoin.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Info */}
      <div
        className="mt-4 rounded-xl p-3 text-xs"
        style={{
          background: "rgba(34,197,94,0.06)",
          border: "1px solid rgba(34,197,94,0.12)",
          color: "var(--muted-light)",
        }}
      >
        <p>
          <span className="font-semibold text-white">Whitelisted wallet</span>{" "}
          &mdash; USDG (Token-2022), USDC &amp; USDT are available to deposit into VeilPay&apos;s
          confidential treasury vaults with encrypted balances.
        </p>
      </div>
    </div>
  );
}
