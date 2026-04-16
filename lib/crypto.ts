/**
 * Client-side AES-256-GCM encryption/decryption.
 * All operations run in the browser using the native Web Crypto API.
 * No plaintext ever leaves the browser tab.
 */

const AES_KEY_LENGTH = 256
const IV_LENGTH = 12   // 96-bit IV for GCM

/** Convert Uint8Array to ArrayBuffer (fixes TS strict type checking for Web Crypto API) */
function toBuffer(arr: Uint8Array): ArrayBuffer {
    return arr.buffer.slice(arr.byteOffset, arr.byteOffset + arr.byteLength) as ArrayBuffer
}

// ─────────────────────────────────────────────────────────────────────────────
// AES Key Generation
// ─────────────────────────────────────────────────────────────────────────────

/** Generate a new AES-256-GCM key. Never transmitted in plaintext. */
export async function generateAesKey(): Promise<CryptoKey> {
    return crypto.subtle.generateKey(
        { name: 'AES-GCM', length: AES_KEY_LENGTH },
        true,   // extractable — needed to encrypt for wallet and re-share
        ['encrypt', 'decrypt']
    )
}

/** Export raw key bytes (for wallet-side encryption before storing on-chain). */
export async function exportAesKey(key: CryptoKey): Promise<Uint8Array> {
    const raw = await crypto.subtle.exportKey('raw', key)
    return new Uint8Array(raw)
}

/** Import raw key bytes back to CryptoKey. */
export async function importAesKey(rawBytes: Uint8Array): Promise<CryptoKey> {
    return crypto.subtle.importKey(
        'raw',
        toBuffer(rawBytes),
        { name: 'AES-GCM', length: AES_KEY_LENGTH },
        false,
        ['encrypt', 'decrypt']
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// File Encryption / Decryption
// ─────────────────────────────────────────────────────────────────────────────

export interface EncryptedBlob {
    /** 12-byte IV prepended to ciphertext */
    iv: Uint8Array
    /** AES-GCM ciphertext + 16-byte authentication tag */
    ciphertext: Uint8Array
    /** Combined [iv | ciphertext] for upload to IPFS */
    combined: Uint8Array
}

/**
 * Encrypt a file with AES-256-GCM.
 * Returns combined [iv | ciphertext] suitable for IPFS upload.
 */
export async function encryptFile(fileBytes: ArrayBuffer, key: CryptoKey): Promise<EncryptedBlob> {
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
    const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        fileBytes
    )
    const ciphertextBytes = new Uint8Array(ciphertext)
    const combined = new Uint8Array(IV_LENGTH + ciphertextBytes.length)
    combined.set(iv, 0)
    combined.set(ciphertextBytes, IV_LENGTH)
    return { iv, ciphertext: ciphertextBytes, combined }
}

/**
 * Decrypt a combined [iv | ciphertext] blob downloaded from IPFS.
 * Throws if authentication tag is invalid (tamper detection).
 */
export async function decryptFile(combined: Uint8Array, key: CryptoKey): Promise<ArrayBuffer> {
    const iv = combined.slice(0, IV_LENGTH)
    const ciphertext = combined.slice(IV_LENGTH)
    return crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: toBuffer(iv) },
        key,
        toBuffer(ciphertext)
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// Key Encryption for Wallet (ECDH-derived shared secret)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Encrypt an AES key for a specific wallet using a signature-derived key.
 *
 * Pattern:
 * 1. Ask wallet to sign a deterministic message (key derivation nonce)
 * 2. Derive AES-256 wrapping key from signature bytes via SHA-256
 * 3. Use wrapping key to AES-GCM encrypt the document AES key
 *
 * This means: only the wallet that produced the original signature can
 * decrypt the AES key — without ever transmitting the raw key.
 */
export async function encryptKeyForWallet(
    aesKeyBytes: Uint8Array,
    walletSignature: string  // hex signature from personal_sign
): Promise<string> {
    // Derive a wrapping key from the wallet signature
    const sigBytes = hexToBytes(walletSignature)
    const wrappingKeyRaw = await crypto.subtle.digest('SHA-256', toBuffer(sigBytes))

    const wrappingKey = await crypto.subtle.importKey(
        'raw',
        wrappingKeyRaw,
        { name: 'AES-GCM', length: AES_KEY_LENGTH },
        false,
        ['encrypt']
    )

    // Encrypt the document AES key with the wrapping key
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
    const encryptedKeyBytes = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        wrappingKey,
        toBuffer(aesKeyBytes)
    )

    // Return combined [iv | encryptedKey] as hex
    const combined = new Uint8Array(IV_LENGTH + encryptedKeyBytes.byteLength)
    combined.set(iv)
    combined.set(new Uint8Array(encryptedKeyBytes), IV_LENGTH)
    return '0x' + bytesToHex(combined)
}

/**
 * Decrypt an AES key using the wallet signature.
 * Requires the same signature that was used to encrypt (deterministic signing message).
 */
export async function decryptKeyFromWallet(
    encryptedKeyHex: string,
    walletSignature: string
): Promise<Uint8Array> {
    const encryptedBytes = hexToBytes(encryptedKeyHex.startsWith('0x') ? encryptedKeyHex.slice(2) : encryptedKeyHex)

    const sigBytes = hexToBytes(walletSignature.startsWith('0x') ? walletSignature.slice(2) : walletSignature)
    const wrappingKeyRaw = await crypto.subtle.digest('SHA-256', toBuffer(sigBytes))

    const wrappingKey = await crypto.subtle.importKey(
        'raw',
        wrappingKeyRaw,
        { name: 'AES-GCM', length: AES_KEY_LENGTH },
        false,
        ['decrypt']
    )

    const iv = encryptedBytes.slice(0, IV_LENGTH)
    const ciphertext = encryptedBytes.slice(IV_LENGTH)

    const rawKey = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: toBuffer(iv) },
        wrappingKey,
        toBuffer(ciphertext)
    )
    return new Uint8Array(rawKey)
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

/** The deterministic message signed by wallets for key derivation. */
export const KEY_DERIVATION_MESSAGE = 'Custos: sign to derive your document encryption key. This signature is used locally and never transmitted.'

function hexToBytes(hex: string): Uint8Array {
    const clean = hex.startsWith('0x') ? hex.slice(2) : hex
    const bytes = new Uint8Array(clean.length / 2)
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16)
    }
    return bytes
}

function bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

/** Generate a document ID from filename + address + nonce. */
export function generateDocId(fileName: string, address: string, nonce: number): string {
    const input = `${fileName}:${address.toLowerCase()}:${nonce}`
    const encoder = new TextEncoder()
    return bytesToHex(encoder.encode(input)).padStart(64, '0').slice(0, 64)
}

/** Convert a string IPFS CID to bytes32 for on-chain storage. */
export function cidToBytes32(cid: string): string {
    const encoder = new TextEncoder()
    const bytes = encoder.encode(cid)
    const padded = new Uint8Array(32)
    padded.set(bytes.slice(0, 32))
    return '0x' + bytesToHex(padded)
}

/** Encode a string as bytes32 hex. */
export function stringToBytes32(str: string): `0x${string}` {
    const encoder = new TextEncoder()
    const bytes = encoder.encode(str)
    const padded = new Uint8Array(32)
    padded.set(bytes.slice(0, 32))
    return ('0x' + bytesToHex(padded)) as `0x${string}`
}
