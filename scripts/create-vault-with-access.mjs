/**
 * Creates a new vault with REAL Inco encryption and proper allow() grants.
 */
import { readFileSync } from "fs";
import { createRequire } from "module";
import { Connection, PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { AnchorProvider, Program, setProvider } from "@coral-xyz/anchor";

const require = createRequire(import.meta.url);

const PROGRAM_ID = new PublicKey("FVwSkmgzT1yvgJ1eWpfyXnaRnD86xfUKtBFHBLFfXkRb");
const INCO_LIGHTNING_ID = new PublicKey("5sjEbPiqgZrYwR31ahR6Uk9wf5awoX61YGg7jExQSwaj");
const AUDITOR = new PublicKey("2DDmzrhbBieRaCrBvvFdb3pWpLJX6B5saxh2ZSUVG6wn");

const connection = new Connection("https://api.devnet.solana.com", "confirmed");

// Load authority keypair
const authorityKp = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(readFileSync("./new-authority.json", "utf-8")))
);

console.log("Authority:", authorityKp.publicKey.toBase58());
console.log("Auditor:", AUDITOR.toBase58());

// Check if vault already exists — need a fresh authority
const [existingPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("vault_config"), authorityKp.publicKey.toBuffer()],
  PROGRAM_ID
);

const existingAccount = await connection.getAccountInfo(existingPda);
if (existingAccount) {
  console.log("\nVault already exists for this authority. Generating a new one...");
  // Generate fresh keypair
  const freshKp = Keypair.generate();
  // Transfer SOL to it
  const { blockhash: bh } = await connection.getLatestBlockhash();
  const transferIx = SystemProgram.transfer({
    fromPubkey: authorityKp.publicKey,
    toPubkey: freshKp.publicKey,
    lamports: 400_000_000, // 0.4 SOL
  });
  const { Transaction } = await import("@solana/web3.js");
  const transferTx = new Transaction().add(transferIx);
  transferTx.recentBlockhash = bh;
  transferTx.feePayer = authorityKp.publicKey;
  transferTx.sign(authorityKp);
  await connection.sendRawTransaction(transferTx.serialize());
  await new Promise(r => setTimeout(r, 2000));

  // Use fresh keypair as authority
  Object.assign(authorityKp, { _keypair: freshKp._keypair });
  // Actually we can't reassign, let's just use the fresh one
  console.log("Fresh authority:", freshKp.publicKey.toBase58());
  await runWithKeypair(freshKp);
} else {
  await runWithKeypair(authorityKp);
}

async function runWithKeypair(kp) {
  const idl = JSON.parse(readFileSync("./target/idl/veilpay.json", "utf-8"));

  const wallet = {
    publicKey: kp.publicKey,
    signTransaction: async (tx) => { tx.partialSign(kp); return tx; },
    signAllTransactions: async (txs) => { txs.forEach(t => t.partialSign(kp)); return txs; },
  };
  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
  setProvider(provider);
  const program = new Program(idl, provider);

  const [vaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault_config"), kp.publicKey.toBuffer()],
    PROGRAM_ID
  );
  console.log("Vault PDA:", vaultPda.toBase58());

  const balance = await connection.getBalance(kp.publicKey);
  console.log("Balance:", balance / 1e9, "SOL");

  // Step 1: Encrypt spending limit with REAL Inco SDK
  console.log("\n--- Encrypting spending limit with Inco SDK ---");
  const { encryptValue } = require("../app/node_modules/@inco/solana-sdk/dist/cjs/src/encryption/index.js");
  const encryptedHex = await encryptValue(1000000n);
  const spendingLimitCiphertext = Buffer.from(encryptedHex, "hex");
  console.log("Ciphertext size:", spendingLimitCiphertext.length, "bytes (need >= 113)");

  // Step 2: Simulate to get handles
  console.log("\n--- Simulating to get handles ---");
  const txForSim = await program.methods
    .initializeVault(AUDITOR, spendingLimitCiphertext, 0)
    .accounts({
      vaultConfig: vaultPda,
      authority: kp.publicKey,
      incoLightningProgram: INCO_LIGHTNING_ID,
      systemProgram: SystemProgram.programId,
    })
    .transaction();

  const { blockhash } = await connection.getLatestBlockhash();
  txForSim.recentBlockhash = blockhash;
  txForSim.feePayer = kp.publicKey;
  txForSim.sign(kp);

  const sim = await connection.simulateTransaction(txForSim, undefined, [vaultPda]);

  if (sim.value.err) {
    console.log("Simulation error:", JSON.stringify(sim.value.err));
    console.log("Logs:", sim.value.logs?.slice(-10));
    process.exit(1);
  }

  if (!sim.value.accounts?.[0]?.data) {
    console.log("WARNING: No account data returned from simulation.");
    console.log("Creating vault without allow() — will need manual grant later.");

    const tx = await program.methods
      .initializeVault(AUDITOR, spendingLimitCiphertext, 0)
      .accounts({
        vaultConfig: vaultPda,
        authority: kp.publicKey,
        incoLightningProgram: INCO_LIGHTNING_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("Vault created:", tx);
    console.log("\n=> Authority:", kp.publicKey.toBase58());
    console.log("=> Update VAULT_AUTHORITY in useVeilPay.ts");
    return;
  }

  // Parse handles from simulated account
  const data = Buffer.from(sim.value.accounts[0].data[0], "base64");
  const balanceHandle = readU128LE(data, 8 + 32 + 32);
  const limitHandle = readU128LE(data, 8 + 32 + 32 + 16);
  const spentHandle = readU128LE(data, 8 + 32 + 32 + 16 + 16);

  console.log("Balance handle:", balanceHandle.toString().slice(0, 20) + "...");
  console.log("Limit handle:", limitHandle.toString().slice(0, 20) + "...");
  console.log("Spent handle:", spentHandle.toString().slice(0, 20) + "...");

  // Step 3: Derive allowance PDAs
  console.log("\n--- Deriving allowance PDAs ---");
  const handles = [balanceHandle, limitHandle, spentHandle];
  const addresses = [kp.publicKey, AUDITOR];
  const remainingAccounts = [];

  for (const handle of handles) {
    for (const addr of addresses) {
      const [pda] = getAllowancePda(handle, addr);
      remainingAccounts.push(
        { pubkey: pda, isSigner: false, isWritable: true },
        { pubkey: addr, isSigner: false, isWritable: false },
      );
    }
  }
  console.log("Total remaining accounts:", remainingAccounts.length);

  // Step 4: Create vault with allow() grants
  console.log("\n--- Creating vault with allow() grants ---");
  const tx = await program.methods
    .initializeVault(AUDITOR, spendingLimitCiphertext, 0)
    .accounts({
      vaultConfig: vaultPda,
      authority: kp.publicKey,
      incoLightningProgram: INCO_LIGHTNING_ID,
      systemProgram: SystemProgram.programId,
    })
    .remainingAccounts(remainingAccounts)
    .rpc();

  console.log("\nSUCCESS! Tx:", tx);
  console.log("\n====================================");
  console.log("Authority:", kp.publicKey.toBase58());
  console.log("Auditor:", AUDITOR.toBase58());
  console.log("Vault PDA:", vaultPda.toBase58());
  console.log("====================================");
  console.log("\n=> Update VAULT_AUTHORITY in useVeilPay.ts to:", kp.publicKey.toBase58());
}

function readU128LE(buf, offset) {
  let val = 0n;
  for (let i = 15; i >= 0; i--) {
    val = (val << 8n) | BigInt(buf[offset + i]);
  }
  return val;
}

function getAllowancePda(handle, address) {
  const buf = Buffer.alloc(16);
  let h = handle;
  for (let i = 0; i < 16; i++) {
    buf[i] = Number(h & 0xffn);
    h >>= 8n;
  }
  return PublicKey.findProgramAddressSync(
    [buf, address.toBuffer()],
    INCO_LIGHTNING_ID
  );
}
