'use client'

import { useState, useEffect } from 'react'
import { useAccount, useReadContract, useSignMessage, usePublicClient, useWalletClient } from 'wagmi'
import { useRouter } from 'next/navigation'
import AIQueryBox from '@/components/AIQueryBox'
import AccessManager from '@/components/AccessManager'
import EncryptionStatus from '@/components/EncryptionStatus'
import { VAULT_ABI, VAULT_ADDRESS } from '@/lib/vault'
import { downloadFromIPFS, bytes32ToCid } from '@/lib/pinata'
import { decryptFile, decryptKeyFromWallet, importAesKey, KEY_DERIVATION_MESSAGE } from '@/lib/crypto'

/** Detect if decrypted bytes look like UTF-8 text (not binary) */
function looksLikeText(bytes: ArrayBuffer): boolean {
    const arr = new Uint8Array(bytes)
    const sample = arr.slice(0, Math.min(512, arr.length))
    let nonPrintable = 0
    for (const b of sample) {
        // Allow tab, newline, carriage return, and printable ASCII + UTF-8 continuation bytes
        if (b < 0x09 || (b > 0x0d && b < 0x20 && b !== 0x1b) || b === 0x7f) {
            nonPrintable++
        }
    }
    // If more than 10% non-printable, it's probably binary
    return nonPrintable / sample.length < 0.1
}

/** Guess MIME type from first few bytes (magic bytes) */
function detectMimeType(bytes: ArrayBuffer): string {
    const arr = new Uint8Array(bytes)
    // PDF: %PDF
    if (arr[0] === 0x25 && arr[1] === 0x50 && arr[2] === 0x44 && arr[3] === 0x46) return 'application/pdf'
    // PNG
    if (arr[0] === 0x89 && arr[1] === 0x50 && arr[2] === 0x4e && arr[3] === 0x47) return 'image/png'
    // JPEG
    if (arr[0] === 0xff && arr[1] === 0xd8) return 'image/jpeg'
    // GIF
    if (arr[0] === 0x47 && arr[1] === 0x49 && arr[2] === 0x46) return 'image/gif'
    // DOCX/ZIP (PK header)
    if (arr[0] === 0x50 && arr[1] === 0x4b && arr[2] === 0x03 && arr[3] === 0x04) return 'application/zip'
    // If it passes the text heuristic, call it text
    if (looksLikeText(bytes)) return 'text/plain'
    return 'application/octet-stream'
}

interface DecryptedDoc {
    text: string | null
    blobUrl: string | null
    mimeType: string
    size: number
    isText: boolean
}

export default function DocViewerContent({ docId }: { docId: string }) {
    const { address, isConnected } = useAccount()
    const { signMessageAsync } = useSignMessage()
    const publicClient = usePublicClient()
    const { data: walletClient } = useWalletClient()
    const router = useRouter()

    const [doc, setDoc] = useState<DecryptedDoc | null>(null)
    const [decrypting, setDecrypting] = useState(false)
    const [hasAccess, setHasAccess] = useState<boolean | null>(null)
    const [checkingAccess, setCheckingAccess] = useState(false)
    const [error, setError] = useState('')
    const [statusMsg, setStatusMsg] = useState('')
    const [tab, setTab] = useState<'ai' | 'access' | 'privacy'>('ai')

    const docIdHex = (docId.startsWith('0x') ? docId : `0x${docId}`) as `0x${string}`

    // Read public doc info from contract
    const { data: docData, error: docReadError } = useReadContract({
        address: VAULT_ADDRESS,
        abi: VAULT_ABI,
        functionName: 'getDocument',
        args: [docIdHex],
    })

    const [ipfsCidBytes32, docExists] = docData ?? [null, false]

    // Debug: log contract read results
    useEffect(() => {
        if (docData) {
            console.log('[Custos] getDocument result:', { ipfsCidBytes32: docData[0], exists: docData[1] })
        }
        if (docReadError) {
            console.error('[Custos] getDocument error:', docReadError)
        }
    }, [docData, docReadError])

    // FHE access check — best-effort, don't block decrypt on it
    // checkAccess is state-mutating (FHE ops) so eth_call may not work correctly.
    // For the owner, _accessExpiry is never set (only grantees get it),
    // so this always returns "false" for owners. We treat it as informational only.
    const { data: accessCtHash } = useReadContract({
        address: VAULT_ADDRESS,
        abi: VAULT_ABI,
        functionName: 'checkAccess',
        args: [docIdHex],
        account: address,
    })

    useEffect(() => {
        if (accessCtHash === undefined) return
        console.log('[Custos] checkAccess ctHash:', accessCtHash)
        // Best-effort: non-zero ctHash suggests the FHE computation ran.
        // Don't rely on this to gate access — the owner's key check is the real gate.
        try {
            const hashBigInt = typeof accessCtHash === 'bigint' ? accessCtHash : BigInt(String(accessCtHash))
            setHasAccess(hashBigInt !== 0n)
        } catch {
            setHasAccess(null)
        }
    }, [accessCtHash])

    async function decryptAndLoad() {
        if (!address) {
            setError('Wallet not connected')
            return
        }

        setDecrypting(true)
        setError('')
        setStatusMsg('')

        try {
            // ── Step 1: Resolve IPFS CID ────────────────────────────────────
            setStatusMsg('Resolving IPFS CID...')
            let cid: string = ''

            // First: check localStorage (stores full CID from new uploads)
            try {
                const cidMap = JSON.parse(localStorage.getItem('custos:cids') || '{}')
                cid = cidMap[docIdHex] || cidMap[docId] || ''
                if (cid) console.log('[Custos] CID from localStorage:', cid)
            } catch { /* ignore */ }

            // Fallback: reconstruct from on-chain bytes32 (may be truncated for CIDv1)
            if (!cid && ipfsCidBytes32) {
                cid = bytes32ToCid(ipfsCidBytes32 as string)
                console.log('[Custos] CID from bytes32:', cid, '(length:', cid.length, ')')
                if (cid.length < 46) {
                    console.warn('[Custos] CID appears truncated — bytes32 cannot store full CIDv1 strings')
                }
            }

            if (!cid) {
                throw new Error(
                    docExists === false
                        ? 'Document not found on-chain. It may not have been registered successfully.'
                        : 'Cannot resolve IPFS CID. The document may have been uploaded before the CID storage fix.'
                )
            }

            // ── Step 2: Sign to derive wrapping key ─────────────────────────
            setStatusMsg('Sign in MetaMask to derive decryption key...')
            console.log('[Custos] Requesting wallet signature for key derivation...')
            const signature = await signMessageAsync({ message: KEY_DERIVATION_MESSAGE })
            console.log('[Custos] Signature obtained')

            // ── Step 3: Read encrypted AES key from contract ────────────────
            setStatusMsg('Reading encryption key from contract...')
            let encKeyHex: string = ''

            // Try owner key first
            try {
                console.log('[Custos] Reading getOwnerKey...')
                const ownerKey = await publicClient!.readContract({
                    address: VAULT_ADDRESS,
                    abi: VAULT_ABI,
                    functionName: 'getOwnerKey',
                    args: [docIdHex],
                })
                console.log('[Custos] getOwnerKey result:', typeof ownerKey, ownerKey ? String(ownerKey).slice(0, 40) + '...' : 'null')
                if (ownerKey && ownerKey !== '0x') {
                    encKeyHex = ownerKey as string
                }
            } catch (e) {
                console.warn('[Custos] getOwnerKey failed:', e)
            }

            // Fallback: try grantee key
            if (!encKeyHex) {
                try {
                    console.log('[Custos] Reading getGrantKey...')
                    const grantKey = await publicClient!.readContract({
                        address: VAULT_ADDRESS,
                        abi: VAULT_ABI,
                        functionName: 'getGrantKey',
                        args: [docIdHex],
                        account: address,
                    })
                    console.log('[Custos] getGrantKey result:', typeof grantKey, grantKey ? String(grantKey).slice(0, 40) + '...' : 'null')
                    if (grantKey && grantKey !== '0x') {
                        encKeyHex = grantKey as string
                    }
                } catch (e) {
                    console.warn('[Custos] getGrantKey failed:', e)
                }
            }

            if (!encKeyHex) {
                throw new Error('No encryption key found on-chain. The document may not have registered correctly, or you don\'t have access.')
            }

            // ── Step 4: Decrypt AES key using wallet signature ──────────────
            setStatusMsg('Decrypting AES key...')
            console.log('[Custos] Decrypting AES key from hex (length:', encKeyHex.length, ')')
            let aesKey: CryptoKey
            try {
                const aesKeyBytes = await decryptKeyFromWallet(encKeyHex, signature)
                console.log('[Custos] AES key bytes recovered:', aesKeyBytes.length, 'bytes')
                aesKey = await importAesKey(aesKeyBytes)
            } catch (e) {
                console.error('[Custos] AES key decryption failed:', e)
                throw new Error(
                    'Failed to decrypt the AES key. This document may have been uploaded with a corrupted key format (pre-fix upload). ' +
                    'Please upload a new document — new uploads store keys correctly.'
                )
            }

            // ── Step 5: Download encrypted blob from IPFS ───────────────────
            setStatusMsg('Downloading encrypted file from IPFS...')
            console.log('[Custos] Downloading from IPFS, CID:', cid)
            let encryptedBlob: Uint8Array
            try {
                encryptedBlob = await downloadFromIPFS(cid)
                console.log('[Custos] Downloaded', encryptedBlob.length, 'bytes from IPFS')
            } catch (e) {
                console.error('[Custos] IPFS download failed:', e)
                throw new Error(
                    `Failed to download from IPFS (CID: ${cid.slice(0, 20)}...). ` +
                    (cid.length < 46 ? 'The CID appears truncated — this document was uploaded before the CID fix. Upload a new document.' : 'The IPFS gateway may be unavailable. Try again.')
                )
            }

            // ── Step 6: Decrypt file ────────────────────────────────────────
            setStatusMsg('Decrypting file locally...')
            let plaintext: ArrayBuffer
            try {
                plaintext = await decryptFile(encryptedBlob, aesKey)
                console.log('[Custos] Decrypted', plaintext.byteLength, 'bytes')
            } catch (e) {
                console.error('[Custos] File decryption failed:', e)
                throw new Error(
                    'AES-GCM decryption failed (authentication tag mismatch). ' +
                    'The file may have been corrupted, or the encryption key doesn\'t match. ' +
                    'If this is an older document, the key was stored incorrectly — please upload again.'
                )
            }

            // ── Step 7: Detect format and render ────────────────────────────
            setStatusMsg('Rendering document...')
            // Check magic bytes first — binary formats like PDF have ASCII-heavy headers
            const mimeType = detectMimeType(plaintext)
            const isText = mimeType === 'text/plain'
            console.log('[Custos] File type:', mimeType, 'isText:', isText, 'size:', plaintext.byteLength)

            const blob = new Blob([plaintext], { type: mimeType })
            const blobUrl = URL.createObjectURL(blob)

            setDoc({
                text: isText ? new TextDecoder().decode(plaintext) : null,
                blobUrl,
                mimeType,
                size: plaintext.byteLength,
                isText,
            })
            setStatusMsg('')
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            console.error('[Custos] Decrypt pipeline failed:', msg)
            setError(msg)
            setStatusMsg('')
        }
        setDecrypting(false)
    }

    // Cleanup blob URL on unmount
    useEffect(() => {
        return () => {
            if (doc?.blobUrl) URL.revokeObjectURL(doc.blobUrl)
        }
    }, [doc?.blobUrl])

    if (!isConnected) {
        router.push('/')
        return null
    }

    return (
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 20px' }}>
            {/* Top bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
                <button className="btn-secondary" onClick={() => router.push('/dashboard')} style={{ padding: '6px 12px', fontSize: 12 }}>
                    ← Dashboard
                </button>
                <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>Document Viewer</div>
                    <div style={{ color: 'var(--text-dim)', fontSize: 12 }} className="mono">{docId.slice(0, 20)}...</div>
                </div>

                {/* FHE Access Status */}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {checkingAccess ? (
                        <span className="badge badge-dim">Checking FHE access...</span>
                    ) : hasAccess === true ? (
                        <span className="badge badge-green">FHE Access: Granted</span>
                    ) : hasAccess === false ? (
                        <span className="badge badge-dim">FHE Access: N/A (owner)</span>
                    ) : (
                        <span className="badge badge-dim">FHE status pending</span>
                    )}
                    <span className="badge badge-purple">Sepolia</span>
                </div>
            </div>

            {/* FHE explanation — always show for educational value */}
            <div className="card" style={{ marginBottom: 20, borderColor: 'rgba(99,102,241,0.3)', background: 'rgba(99,102,241,0.05)' }}>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.7 }}>
                    <strong style={{ color: 'var(--text)' }}>How access works:</strong> The contract stores access expiry as{' '}
                    <code style={{ fontFamily: 'monospace', background: 'var(--surface-2)', padding: '1px 4px', borderRadius: 3 }}>
                        euint64
                    </code>{' '}
                    (FHE-encrypted). Checking access computes{' '}
                    <code style={{ fontFamily: 'monospace', background: 'var(--surface-2)', padding: '1px 4px', borderRadius: 3 }}>
                        FHE.gt(expiry, block.timestamp)
                    </code>{' '}
                    in encrypted domain. Document owners decrypt using their wallet-derived AES key — no FHE access grant needed.
                </div>
            </div>

            {/* Main content grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 24, alignItems: 'start' }}>
                {/* Left: document + AI */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {/* Decrypt section */}
                    {!doc && (
                        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
                            <div style={{ fontSize: 32, marginBottom: 12 }}>🔐</div>
                            <div style={{ fontWeight: 600, marginBottom: 8 }}>Document Encrypted</div>
                            <div style={{ color: 'var(--text-dim)', fontSize: 13, marginBottom: 20 }}>
                                Stored on IPFS as AES-256-GCM ciphertext.
                                Decrypt locally to view — nothing leaves your browser.
                            </div>
                            <button
                                className="btn-primary"
                                onClick={decryptAndLoad}
                                disabled={decrypting}
                                style={{ padding: '10px 24px' }}
                            >
                                {decrypting ? '⏳ Decrypting...' : '🔓 Decrypt & View Document'}
                            </button>

                            {/* Progress status */}
                            {statusMsg && (
                                <div style={{ color: 'var(--accent)', fontSize: 12, marginTop: 12, fontWeight: 500 }}>
                                    {statusMsg}
                                </div>
                            )}

                            {/* Error display — prominent */}
                            {error && (
                                <div style={{
                                    marginTop: 16,
                                    padding: '12px 16px',
                                    background: 'rgba(239,68,68,0.1)',
                                    border: '1px solid rgba(239,68,68,0.3)',
                                    borderRadius: 8,
                                    color: '#ef4444',
                                    fontSize: 13,
                                    textAlign: 'left',
                                    lineHeight: 1.6,
                                }}>
                                    {error}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Decrypted document content */}
                    {doc && (
                        <>
                            {/* Tabs */}
                            <div style={{ display: 'flex', gap: 4, background: 'var(--surface)', padding: 4, borderRadius: 10, border: '1px solid var(--border)' }}>
                                {[
                                    { key: 'ai', label: '🤖 AI Q&A' },
                                    { key: 'access', label: '🔐 Access Control' },
                                    { key: 'privacy', label: '🛡️ Privacy Layers' },
                                ].map(t => (
                                    <button
                                        key={t.key}
                                        onClick={() => setTab(t.key as typeof tab)}
                                        style={{
                                            flex: 1,
                                            background: tab === t.key ? 'var(--accent)' : 'transparent',
                                            color: tab === t.key ? 'white' : 'var(--text-dim)',
                                            border: 'none',
                                            borderRadius: 8,
                                            padding: '6px 12px',
                                            fontSize: 13,
                                            fontWeight: tab === t.key ? 600 : 400,
                                        }}
                                    >
                                        {t.label}
                                    </button>
                                ))}
                            </div>

                            {tab === 'ai' && doc.text && (
                                <AIQueryBox docId={docIdHex} documentText={doc.text} />
                            )}
                            {tab === 'ai' && !doc.text && (
                                <div className="card" style={{ color: 'var(--text-dim)', fontSize: 13, textAlign: 'center', padding: 32 }}>
                                    AI Q&A is only available for text documents. This file is binary ({doc.mimeType}).
                                </div>
                            )}

                            {tab === 'access' && (
                                <AccessManager docId={docIdHex} isOwner={true} />
                            )}

                            {tab === 'privacy' && (
                                <EncryptionStatus />
                            )}
                        </>
                    )}
                </div>

                {/* Right: document preview / on-chain record */}
                <div className="card">
                    <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>
                        {doc ? 'Decrypted Document' : 'On-Chain Record'}
                    </div>

                    {!doc ? (
                        <div style={{ fontSize: 12, color: 'var(--text-dim)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>Document ID</span>
                                <span className="mono" style={{ fontSize: 10 }}>{docId.slice(0, 14)}...</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>On-chain</span>
                                <span className="badge" style={{ fontSize: 10, background: docExists ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', color: docExists ? 'rgb(34,197,94)' : '#ef4444' }}>
                                    {docExists ? 'registered' : 'not found'}
                                </span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>IPFS CID</span>
                                <span className="badge badge-dim" style={{ fontSize: 10 }}>stored on-chain</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>Owner</span>
                                <span className="badge badge-purple" style={{ fontSize: 10 }}>eaddress (encrypted)</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>Upload Time</span>
                                <span className="badge badge-purple" style={{ fontSize: 10 }}>euint64 (encrypted)</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>Access Expiry</span>
                                <span className="badge badge-purple" style={{ fontSize: 10 }}>euint64 (encrypted)</span>
                            </div>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {/* File info */}
                            <div style={{ fontSize: 11, color: 'var(--text-dim)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <div>Type: {doc.mimeType}</div>
                                <div>Size: {(doc.size / 1024).toFixed(1)} KB (decrypted)</div>
                            </div>

                            {/* Text preview */}
                            {doc.text && (
                                <div style={{
                                    background: 'var(--surface-2)',
                                    borderRadius: 8,
                                    padding: 12,
                                    fontFamily: 'monospace',
                                    fontSize: 11,
                                    lineHeight: 1.6,
                                    maxHeight: 400,
                                    overflowY: 'auto',
                                    color: 'var(--text-dim)',
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-word',
                                }}>
                                    {doc.text.slice(0, 2000)}
                                    {doc.text.length > 2000 && '\n\n[...truncated for preview...]'}
                                </div>
                            )}

                            {/* Image preview */}
                            {doc.mimeType.startsWith('image/') && doc.blobUrl && (
                                <img
                                    src={doc.blobUrl}
                                    alt="Decrypted document"
                                    style={{ maxWidth: '100%', borderRadius: 8, border: '1px solid var(--border)' }}
                                />
                            )}

                            {/* PDF embed */}
                            {doc.mimeType === 'application/pdf' && doc.blobUrl && (
                                <iframe
                                    src={doc.blobUrl}
                                    style={{ width: '100%', height: 400, borderRadius: 8, border: '1px solid var(--border)' }}
                                />
                            )}

                            {/* Download button — always available */}
                            {doc.blobUrl && (
                                <a
                                    href={doc.blobUrl}
                                    download={`custos-decrypted-${docId.slice(0, 8)}`}
                                    className="btn-secondary"
                                    style={{ textAlign: 'center', textDecoration: 'none', padding: '8px 12px', fontSize: 12 }}
                                >
                                    ⬇ Download Decrypted File
                                </a>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
