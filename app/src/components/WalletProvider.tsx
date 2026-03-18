"use client";

import { useMemo, ReactNode } from "react";
import {
  ConnectionProvider,
  WalletProvider as SolanaWalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { DEVNET_RPC } from "@/lib/anchor";

import "@solana/wallet-adapter-react-ui/styles.css";

export default function WalletProvider({ children }: { children: ReactNode }) {
  // Empty array — wallet-adapter auto-detects installed wallets (Phantom, Solflare, etc.)
  // Manually specifying adapters causes duplicate key errors with auto-detection
  const wallets = useMemo(() => [], []);

  return (
    <ConnectionProvider endpoint={DEVNET_RPC}>
      <SolanaWalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </SolanaWalletProvider>
    </ConnectionProvider>
  );
}
