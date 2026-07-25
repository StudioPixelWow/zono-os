// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · MESSAGING AT-REST ENCRYPTION (server). Phase 6.
// ----------------------------------------------------------------------------
// The production `Encryptor` for message bodies. It REUSES the shipped AES-256-GCM
// at-rest primitive (@/lib/security/crypto) — no second crypto implementation. The
// key lives only in the server environment; it is NEVER surfaced, logged, or stored.
// Plaintext bodies are encrypted before any DB write and decrypted only for an
// authorized server-side read. QA injects a deterministic fake instead of this.
// ============================================================================
import "server-only";
import { encryptSecret, decryptSecret } from "@/lib/security/crypto";
import type { Encryptor } from "./ports";

/** AES-256-GCM message-body encryptor (reuses the shipped primitive). */
export function createMessagingEncryptor(): Encryptor {
  return {
    encrypt: (plaintext: string) => encryptSecret(plaintext),
    decrypt: (ciphertext: string) => { try { return decryptSecret(ciphertext); } catch { return ""; } },
  };
}
