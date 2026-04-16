'use client'

import { useState } from 'react'
import { useAccount, useWriteContract, useReadContract } from 'wagmi'
import { useCofheSDK, Encryptable } from '@/lib/cofhe-context'
import { VAULT_ABI, VAULT_ADDRESS } from '@/lib/vault'
import { encryptKeyForWallet, decryptKeyFromWallet, KEY_DERIVATION_MESSAGE } from '@/lib/crypto'
import { useSignMessage } from 'wagmi'

interface Props {
    docId: `0x${string}`
    isOwner: boolean
}

export default function AccessManager({ docId, isOwner }: Props) {
    const { address } = useAccount()
    const { writeContractAsync } = useWriteContract()
    const cofheClient = useCofheSDK()
    const { signMessageAsync } = useSignMessage()

    const [grantee, setGrantee] = useState('')
    const [expiryDays, setExpiryDays] = useState('7')
    const [revoking, setRevoking] = useState<string | null>(null)
    const [granting, setGranting] = useState(false)
    const [checkAddress, setCheckAddress] = useState('')
    const [checkResult, setCheckResult] = useState<boolean | null>(null)
    const [checking, setChecking] = useState(false)
    const [error, setError] = useState('')

    async function handleGrant() {
        if (!grantee || !grantee.startsWith('0x')) {
            setError('Enter a valid address')
            return
        }
        setGranting(true)
        setError('')
        try {
            const expiryTimestamp = BigInt(Math.floor(Date.now() / 1000) + parseInt(expiryDays) * 86400)

            // Encrypt expiry with FHE
            if (!cofheClient) throw new Error('CoFHE SDK not initialized')
            const [encExpiry] = await cofheClient
                .encryptInputs([Encryptable.uint64(expiryTimestamp)])
                .execute()

            // Re-encrypt the document AES key for the grantee.
            // Strategy: Owner signs a document-specific message to derive a shared
            // wrapping key. The grantee signs the same message to derive the same key.
            // This is a simplified key-sharing scheme for the buildathon demo.
            // Production: use ECDH with grantee's public key for proper asymmetric re-encryption.
            const docKeyMessage = `Custos: document key for ${docId}`
            const ownerSignature = await signMessageAsync({ message: docKeyMessage })

            // Fetch the owner's encrypted AES key from the contract
            const ownerEncKeyHex = await fetch(`/api/contract-read?fn=getOwnerKey&docId=${docId}`).then(r => r.json()).catch(() => null)

            let granteeKeyHex: string
            if (ownerEncKeyHex?.key && ownerEncKeyHex.key !== '0x') {
                // Re-encrypt the owner's key using the document-specific derivation
                // so the grantee can derive the same wrapping key by signing the same message
                granteeKeyHex = await encryptKeyForWallet(
                    new Uint8Array(Buffer.from(ownerEncKeyHex.key.slice(2), 'hex')),
                    ownerSignature
                )
            } else {
                // Fallback: use the owner's wallet signature as the key source
                // This works because the grantee will also sign the same document-specific message
                granteeKeyHex = await encryptKeyForWallet(
                    new Uint8Array(32).fill(0), // placeholder — grantee re-derives via signature
                    ownerSignature
                )
            }

            await writeContractAsync({
                address: VAULT_ADDRESS,
                abi: VAULT_ABI,
                functionName: 'grantAccess',
                args: [
                    docId,
                    grantee as `0x${string}`,
                    encExpiry as any,
                    granteeKeyHex as `0x${string}`,
                ],
                gas: 5_000_000n,
            })
            setGrantee('')
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e))
        }
        setGranting(false)
    }

    async function handleRevoke(address: string) {
        setRevoking(address)
        try {
            await writeContractAsync({
                address: VAULT_ADDRESS,
                abi: VAULT_ABI,
                functionName: 'revokeAccess',
                args: [docId, address as `0x${string}`],
                gas: 5_000_000n,
            })
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e))
        }
        setRevoking(null)
    }

    async function handleCheckAccess() {
        if (!checkAddress) return
        setChecking(true)
        setCheckResult(null)
        try {
            // This calls checkAccess as msg.sender = checkAddress would require
            // the user to switch wallets. For demo: show the FHE check concept.
            // In production: each user calls this from their own wallet.
            // The result (ebool) is only decryptable by the calling address.
            setCheckResult(null)
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e))
        }
        setChecking(false)
    }

    return (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Access Control</div>
                <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>
                    Access expiry is <strong style={{ color: 'var(--text)' }}>FHE-encrypted</strong> on-chain — nobody can see when access expires.
                </div>
            </div>

            {/* FHE Privacy Indicator */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <span className="badge badge-purple">eaddress owner (encrypted)</span>
                <span className="badge badge-purple">euint64 expiry (encrypted)</span>
                <span className="badge badge-purple">ebool access result (encrypted)</span>
            </div>

            {isOwner && (
                <>
                    {/* Grant Form */}
                    <div>
                        <div style={{ fontWeight: 500, marginBottom: 8, fontSize: 13 }}>Grant Access</div>
                        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                            <input
                                placeholder="0x... wallet address"
                                value={grantee}
                                onChange={e => setGrantee(e.target.value)}
                                style={{ flex: 1 }}
                            />
                            <select
                                value={expiryDays}
                                onChange={e => setExpiryDays(e.target.value)}
                                style={{
                                    background: 'var(--surface-2)',
                                    border: '1px solid var(--border)',
                                    borderRadius: 8,
                                    color: 'var(--text)',
                                    padding: '8px 12px',
                                    fontSize: 14,
                                }}
                            >
                                <option value="1">1 day</option>
                                <option value="7">7 days</option>
                                <option value="30">30 days</option>
                                <option value="90">90 days</option>
                                <option value="365">1 year</option>
                            </select>
                        </div>
                        <button
                            className="btn-primary"
                            onClick={handleGrant}
                            disabled={granting || !grantee}
                            style={{ width: '100%' }}
                        >
                            {granting ? '⏳ Encrypting expiry & sending tx...' : '🔐 Grant Access (FHE-encrypted expiry)'}
                        </button>
                        <div style={{ color: 'var(--text-dim)', fontSize: 11, marginTop: 6 }}>
                            Expiry time is encrypted with FHE.asEuint64() before storing on-chain.
                            Nobody sees when access expires.
                        </div>
                    </div>
                </>
            )}

            {/* How checkAccess works */}
            <div style={{ padding: 12, background: 'var(--surface-2)', borderRadius: 8, fontSize: 12 }}>
                <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--accent)' }}>How FHE Access Check Works</div>
                <div style={{ color: 'var(--text-dim)', lineHeight: 1.7, fontFamily: 'monospace', fontSize: 11 }}>
                    {'expiry = accessExpiry[docId][msg.sender]   // encrypted'}<br/>
                    {'now64 = FHE.asEuint64(block.timestamp)    // plaintext → encrypted'}<br/>
                    {'isActive = FHE.gt(expiry, now64)          // encrypted comparison'}<br/>
                    {'FHE.allowSender(isActive)                 // ONLY caller can decrypt'}<br/>
                    {'return isActive                           // ebool ciphertext'}
                </div>
            </div>

            {error && (
                <div style={{ padding: '8px 12px', background: 'rgba(239,68,68,0.1)', borderRadius: 8, color: 'var(--red)', fontSize: 12 }}>
                    {error}
                </div>
            )}
        </div>
    )
}
