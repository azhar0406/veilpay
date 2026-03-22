import { AnchorProvider, Program, Idl } from "@coral-xyz/anchor";
import { Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";
import { AnchorWallet } from "@solana/wallet-adapter-react";

export const PROGRAM_ID = new PublicKey(
  "FVwSkmgzT1yvgJ1eWpfyXnaRnD86xfUKtBFHBLFfXkRb"
);

export const INCO_LIGHTNING_PROGRAM_ID = new PublicKey(
  "5sjEbPiqgZrYwR31ahR6Uk9wf5awoX61YGg7jExQSwaj"
);

export const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
);

export const TOKEN_2022_PROGRAM_ID = new PublicKey(
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
);

export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
);

// Devnet stablecoin mints
export const USDC_MINT = new PublicKey(
  "8iBux2LRja1PhVZph8Rw4Hi45pgkaufNEiaZma5nTD5g"
);

export const USDT_MINT = new PublicKey(
  "5dXXpWyZCCPhBHxmp79Du81t7t9oh7HacUW864ARFyft"
);

// USDG — Token-2022 mint used as collateral on devnet
export const USDG_MINT = new PublicKey(
  "HLwjxqGBrZPN7hehv7e9RXnqBr4AHJ9YMczFpw9AZu7r"
);

// Token-2022 mints — used to pick the correct token program
const TOKEN_2022_MINTS = new Set([USDG_MINT.toBase58()]);

export function isToken2022Mint(mint: PublicKey): boolean {
  return TOKEN_2022_MINTS.has(mint.toBase58());
}

export function getTokenProgramId(mint: PublicKey): PublicKey {
  return isToken2022Mint(mint) ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
}

export const DEVNET_RPC = clusterApiUrl("devnet");

export function getAssociatedTokenAddress(
  mint: PublicKey,
  owner: PublicKey,
  tokenProgramId?: PublicKey
): PublicKey {
  const tokProgram = tokenProgramId || getTokenProgramId(mint);
  const [ata] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), tokProgram.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  return ata;
}

export function getConnection(): Connection {
  return new Connection(DEVNET_RPC, "confirmed");
}

export function getProvider(wallet: AnchorWallet): AnchorProvider {
  const connection = getConnection();
  return new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
}

export function getVaultPda(authority: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault_config"), authority.toBuffer()],
    PROGRAM_ID
  );
}

export function getWhitelistPda(
  vault: PublicKey,
  wallet: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("whitelist"), vault.toBuffer(), wallet.toBuffer()],
    PROGRAM_ID
  );
}

export function getPaymentPda(
  vault: PublicKey,
  nonce: number
): [PublicKey, number] {
  // Write u64 as little-endian bytes without BigInt buffer methods (browser compat)
  const nonceBuffer = new Uint8Array(8);
  let n = nonce;
  for (let i = 0; i < 8; i++) {
    nonceBuffer[i] = n & 0xff;
    n = Math.floor(n / 256);
  }
  return PublicKey.findProgramAddressSync(
    [Buffer.from("payment"), vault.toBuffer(), Buffer.from(nonceBuffer)],
    PROGRAM_ID
  );
}

export function getAllowancePda(
  handle: bigint,
  allowedAddress: PublicKey
): [PublicKey, number] {
  const handleBuffer = Buffer.alloc(16);
  let h = handle;
  for (let i = 0; i < 16; i++) {
    handleBuffer[i] = Number(h & BigInt(0xff));
    h = h >> BigInt(8);
  }
  return PublicKey.findProgramAddressSync(
    [handleBuffer, allowedAddress.toBuffer()],
    INCO_LIGHTNING_PROGRAM_ID
  );
}
