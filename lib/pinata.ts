/**
 * Pinata IPFS client wrapper.
 * Only encrypted blobs are uploaded — Pinata never sees plaintext.
 */

const PINATA_JWT = process.env.NEXT_PUBLIC_PINATA_JWT || process.env.PINATA_JWT || ''
const PINATA_GATEWAY = process.env.NEXT_PUBLIC_PINATA_GATEWAY || process.env.PINATA_GATEWAY || 'https://gateway.pinata.cloud'

// ─────────────────────────────────────────────────────────────────────────────
// Upload
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Upload an encrypted file blob to IPFS via Pinata.
 * The blob MUST be AES-256-GCM ciphertext — never upload plaintext.
 *
 * @param encryptedBytes Combined [iv | ciphertext] from encryptFile()
 * @param name Human-readable name (opaque — no PII)
 * @returns IPFS CID string
 */
export async function uploadEncryptedToIPFS(
    encryptedBytes: Uint8Array,
    name: string = 'encrypted-doc'
): Promise<string> {
    const blob = new Blob([encryptedBytes.buffer.slice(encryptedBytes.byteOffset, encryptedBytes.byteOffset + encryptedBytes.byteLength) as ArrayBuffer], { type: 'application/octet-stream' })
    const file = new File([blob], name)

    const formData = new FormData()
    formData.append('file', file)
    formData.append('pinataMetadata', JSON.stringify({ name }))
    formData.append('pinataOptions', JSON.stringify({ cidVersion: 1 }))

    const response = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${PINATA_JWT}`,
        },
        body: formData,
    })

    if (!response.ok) {
        const error = await response.text()
        throw new Error(`Pinata upload failed: ${response.status} ${error}`)
    }

    const result = (await response.json()) as { IpfsHash: string }
    return result.IpfsHash
}

// ─────────────────────────────────────────────────────────────────────────────
// Download
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Download an encrypted blob from IPFS.
 * Tries multiple gateways for reliability (Pinata public gateway was deprecated).
 *
 * @param cid IPFS CID
 * @returns Encrypted bytes [iv | ciphertext]
 */
export async function downloadFromIPFS(cid: string): Promise<Uint8Array> {
    const gateways = [
        PINATA_GATEWAY,
        'https://ipfs.io',
        'https://cloudflare-ipfs.com',
        'https://w3s.link',
    ].filter(Boolean)

    let lastError: Error | null = null

    for (const gw of gateways) {
        const url = `${gw}/ipfs/${cid}`
        try {
            console.log(`[Custos] Trying IPFS gateway: ${gw}`)
            const response = await fetch(url, { signal: AbortSignal.timeout(15000) })
            if (response.ok) {
                const buffer = await response.arrayBuffer()
                console.log(`[Custos] Downloaded ${buffer.byteLength} bytes from ${gw}`)
                return new Uint8Array(buffer)
            }
            lastError = new Error(`${gw}: HTTP ${response.status}`)
        } catch (e) {
            lastError = e instanceof Error ? e : new Error(String(e))
            console.warn(`[Custos] Gateway ${gw} failed:`, lastError.message)
        }
    }

    throw new Error(`IPFS download failed from all gateways for CID ${cid}. Last error: ${lastError?.message}`)
}

// ─────────────────────────────────────────────────────────────────────────────
// CID utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert an IPFS CID string to bytes32 for on-chain storage.
 * Pads or truncates to exactly 32 bytes.
 */
export function cidToBytes32(cid: string): `0x${string}` {
    const encoder = new TextEncoder()
    const bytes = encoder.encode(cid)
    const padded = new Uint8Array(32)
    padded.set(bytes.slice(0, 32))
    return ('0x' + Array.from(padded).map(b => b.toString(16).padStart(2, '0')).join('')) as `0x${string}`
}

/**
 * Convert a bytes32 on-chain value back to a CID string.
 */
export function bytes32ToCid(bytes32: string): string {
    const hex = bytes32.startsWith('0x') ? bytes32.slice(2) : bytes32
    const bytes = new Uint8Array(hex.match(/.{2}/g)!.map(b => parseInt(b, 16)))
    // Remove null padding
    const trimmed = bytes.slice(0, bytes.indexOf(0) === -1 ? bytes.length : bytes.indexOf(0))
    return new TextDecoder().decode(trimmed)
}
