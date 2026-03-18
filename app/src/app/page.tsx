"use client";

import { Buffer } from "buffer";
if (typeof window !== "undefined" && !window.Buffer) {
  window.Buffer = Buffer;
}

import dynamic from "next/dynamic";

const WalletProvider = dynamic(() => import("@/components/WalletProvider"), {
  ssr: false,
});

const VaultDashboard = dynamic(() => import("@/components/VaultDashboard"), {
  ssr: false,
});

export default function Home() {
  return (
    <WalletProvider>
      <VaultDashboard />
    </WalletProvider>
  );
}
