// Inco Lightning SVM SDK helpers
import { PublicKey } from "@solana/web3.js";

export async function encryptAmount(amount: bigint): Promise<{
  ciphertext: Uint8Array;
  inputType: number;
}> {
  try {
    const { encryptValue } = await import("@inco/solana-sdk/encryption");
    const encrypted = await encryptValue(amount);
    // Convert hex string to Uint8Array
    const bytes = new Uint8Array(encrypted.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(encrypted.substr(i * 2, 2), 16);
    }
    return { ciphertext: bytes, inputType: 0 };
  } catch {
    // Fallback for development/testing when Inco SDK is unavailable
    console.warn("Inco SDK encryption unavailable, using mock encryption");
    const buf = new Uint8Array(32);
    let val = amount;
    for (let i = 0; i < 16; i++) {
      buf[i] = Number(val & BigInt(0xff));
      val = val >> BigInt(8);
    }
    return { ciphertext: buf, inputType: 0 };
  }
}

export async function decryptHandle(
  handles: string[],
  walletPublicKey: PublicKey,
  signMessage: (msg: Uint8Array) => Promise<Uint8Array>
): Promise<{ plaintexts: string[]; error?: string }> {
  try {
    const { decrypt } = await import("@inco/solana-sdk/attested-decrypt");
    const result = await decrypt(handles, {
      address: walletPublicKey,
      signMessage,
    });
    return { plaintexts: result.plaintexts };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Inco decrypt error:", msg);
    return {
      plaintexts: handles.map(() => "N/A"),
      error: msg,
    };
  }
}

/**
 * Extract the raw handle string from an Euint128 value.
 * Anchor deserializes Euint128 (a tuple struct) as { "0": BN }.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractHandle(euint128: any): string {
  if (euint128 == null) return "0";
  if (typeof euint128 === "string") return euint128;
  if (typeof euint128 === "bigint") return euint128.toString();

  // Anchor tuple struct: { "0": BN }
  if (typeof euint128 === "object" && euint128["0"] != null) {
    const inner = euint128["0"];
    // BN has a toString(base) method that always returns full decimal
    if (inner && typeof inner.toString === "function") {
      // Use toString(10) to force full decimal (no scientific notation)
      try { return inner.toString(10); } catch { /* fall through */ }
    }
    // If it's a JS number (overflows to scientific notation), convert via BigInt
    if (typeof inner === "number") {
      try { return BigInt(Math.round(inner)).toString(); } catch { /* fall through */ }
    }
    return String(inner);
  }

  // Plain BN
  if (euint128.toString && euint128.toArray) {
    return euint128.toString(10);
  }

  // JS number — avoid scientific notation
  if (typeof euint128 === "number") {
    try { return BigInt(Math.round(euint128)).toString(); } catch { /* fall through */ }
  }

  if (typeof euint128.toString === "function") {
    const s = euint128.toString();
    if (s !== "[object Object]") return s;
  }
  return "0";
}

export function formatEncryptedHandle(handle: string): string {
  if (handle.length <= 12) return handle;
  return `${handle.slice(0, 6)}...${handle.slice(-6)}`;
}
