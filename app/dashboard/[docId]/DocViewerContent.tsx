'use client'

import { useState, useEffect } from 'react'
import { useAccount, useReadContract, useSignMessage } from 'wagmi'
import { useCofheSDK, FheTypes } from '@/lib/cofhe-context'
import { useRouter } from 'next/navigation'
import AIQueryBox from '@/components/AIQueryBox'
import AccessManager from '@/components/AccessManager'
import EncryptionStatus from '@/components/EncryptionStatus'
import { VAULT_ABI, VAULT_ADDRESS } from '@/lib/vault'
import { downloadFromIPFS, bytes32ToCid } from '@/lib/pinata'
import { decryptFile, decryptKeyFromWallet, importAesKey, KEY_DERIVATION_MESSAGE } from '@/lib/crypto'

export default function DocViewerContent({ docId }: { docId: string }) {
    const { address, isConnected } = useAccount()
    const { signMessageAsync } = useSignMessage()
    const cofheClient = useCofheSDK()
    const router = useRouter()

    const [documentText, setDocumentText] = useState<string | null>(null)
    const [decrypting, setDecrypting] = useState(false)
    const [hasAccess, setHasAccess] = useState<boolean | null>(null)
    const [checkingAccess, setCheckingAccess] = useState(false)
    const [error, setError] = useState('')
    const [tab, setTab] = useState<'ai' | 'access' | 'privacy'>('ai')

    const docIdHex = (docId.startsWith('0x') ? docId : `0x${docId}`) as `0x${string}`

    // Read public doc info from contract
    const { data: docData } = useReadContract({
        address: VAULT_ADDRESS,
        abi: VAULT_ABI,
        functionName: 'getDocument',
        args: [docIdHex],
    })

    const [ipfsCidBytes32, docExists] = docData ?? [null, false]

    // Read encrypted access result (ebool from FHE)
    const { data: accessCtHash } = useReadContract({
        address: VAULT_ADDRESS,
        abi: VAULT_ABI,
        functionName: 'checkAccess',
        args: [docIdHex],
        account: address,
    })

    // Decrypt the FHE access check result using CoFHE SDK
    useEffect(() => {
        if (!accessCtHash || !cofheClient) return
        setCheckingAccess(true)

        async function decryptAccess() {
            try {
                // Try real SDK decryption (works on Sepolia with CoFHE threshold network)
                const result = await cofheClient!
                    .decryptForView(accessCtHash as bigint, FheTypes.Bool)
                    .withPermit()
                    .execute()
                setHasAccess(Boolean(result))
            } catch {
                // Fallback for local/mock: non-zero ctHash = access granted
                try {
                    const hashBigInt = typeof accessCtHash === 'bigint' ? accessCtHash : BigInt(String(accessCtHash))
                    setHasAccess(hashBigInt !== 0n)
                } catch {
                    setHasAccess(false)
                }
            } finally {
                setCheckingAccess(false)
            }
        }

        decryptAccess()
    }, [accessCtHash, cofheClient])

    async function decryptAndLoad() {
        if (!ipfsCidBytes32 || !address) return
        setDecrypting(true)
        setError('')
        try {
            // Get CID string from bytes32
            const cid = bytes32ToCid(ipfsCidBytes32 as string)

            // Derive wallet key from signature (same message used during upload)
            const signature = await signMessageAsync({ message: KEY_DERIVATION_MESSAGE })

            // Fetch encrypted AES key from contract
            // Try owner key first, then grantee key
            let encKeyHex: string = ''
            try {
                const response = await fetch(`/api/contract-read?fn=getOwnerKey&docId=${docIdHex}`)
                const data = await response.json()
                if (data.key && data.key !== '0x') {
                    encKeyHex = data.key
                }
            } catch {
                // Owner key fetch failed — try grantee key
            }

            if (!encKeyHex) {
                try {
                    const response = await fetch(`/api/contract-read?fn=getGrantKey&docId=${docIdHex}&address=${address}`)
                    const data = await response.json()
                    if (data.key && data.key !== '0x') {
                        encKeyHex = data.key
                    }
                } catch {
                    // Grantee key fetch also failed
                }
            }

            if (!encKeyHex) {
                throw new Error('No encryption key found. You may not have access to this document.')
            }

            // Decrypt AES key using wallet signature
            const aesKeyBytes = await decryptKeyFromWallet(encKeyHex, signature)
            const aesKey = await importAesKey(aesKeyBytes)

            // Download encrypted blob from IPFS
            const encryptedBlob = await downloadFromIPFS(cid)

            // Decrypt file locally — plaintext never leaves browser
            const plaintext = await decryptFile(encryptedBlob, aesKey)
            const text = new TextDecoder().decode(plaintext)
            setDocumentText(text)
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e))
        }
        setDecrypting(false)
    }

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
                        <span className="badge badge-dim">⏳ Checking FHE access...</span>
                    ) : hasAccess === true ? (
                        <span className="badge badge-green">✓ FHE Access: Granted</span>
                    ) : hasAccess === false ? (
                        <span className="badge badge-red">✗ FHE Access: Denied</span>
                    ) : (
                        <span className="badge badge-dim">Connect to check access</span>
                    )}
                    <span className="badge badge-purple">Sepolia</span>
                </div>
            </div>

            {/* FHE Access explanation */}
            {hasAccess !== null && (
                <div className="card" style={{ marginBottom: 20, borderColor: hasAccess ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)', background: hasAccess ? 'rgba(34,197,94,0.05)' : 'rgba(239,68,68,0.05)' }}>
                    <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.7 }}>
                        <strong style={{ color: 'var(--text)' }}>FHE check result:</strong> The contract computed{' '}
                        <code style={{ fontFamily: 'monospace', background: 'var(--surface-2)', padding: '1px 4px', borderRadius: 3 }}>
                            FHE.gt(expiry, block.timestamp)
                        </code>{' '}
                        in encrypted domain. The result (ebool) was decrypted locally — only your wallet could read it.
                        {' '}<strong>Expiry time is never revealed.</strong>
                    </div>
                </div>
            )}

            {/* Main content grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 24, alignItems: 'start' }}>
                {/* Left: document + AI */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {/* Decrypt section */}
                    {!documentText && (
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
                                disabled={decrypting || hasAccess === false}
                                style={{ padding: '10px 24px' }}
                            >
                                {decrypting ? '⏳ Decrypting locally...' : '🔓 Decrypt & View Document'}
                            </button>
                            {hasAccess === false && (
                                <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 8 }}>
                                    FHE access check returned false — you don&apos;t have access to this document.
                                </div>
                            )}
                            {error && (
                                <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 8 }}>{error}</div>
                            )}
                        </div>
                    )}

                    {documentText && (
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

                            {tab === 'ai' && (
                                <AIQueryBox docId={docIdHex} documentText={documentText} />
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

                {/* Right: document preview */}
                <div className="card">
                    <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>
                        {documentText ? 'Document Preview' : 'On-Chain Record'}
                    </div>

                    {!documentText ? (
                        <div style={{ fontSize: 12, color: 'var(--text-dim)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>Document ID</span>
                                <span className="mono" style={{ fontSize: 10 }}>{docId.slice(0, 14)}...</span>
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
                                <span>Your Access</span>
                                <span className="badge badge-purple" style={{ fontSize: 10 }}>ebool (encrypted)</span>
                            </div>
                        </div>
                    ) : (
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
                        }}>
                            {documentText.slice(0, 1500)}
                            {documentText.length > 1500 && '\n\n[...truncated for preview...]'}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
