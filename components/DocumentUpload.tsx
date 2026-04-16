'use client'

import { useState, useRef, DragEvent, ChangeEvent } from 'react'
import { useAccount, useSignMessage, useWriteContract } from 'wagmi'
import { keccak256, toHex, toBytes } from 'viem'
import { useCofheSDK, Encryptable } from '@/lib/cofhe-context'
import { encryptFile, generateAesKey, exportAesKey, encryptKeyForWallet, KEY_DERIVATION_MESSAGE, cidToBytes32 } from '@/lib/crypto'
import { uploadEncryptedToIPFS, cidToBytes32 as pinataCidToBytes32 } from '@/lib/pinata'
import { VAULT_ABI, VAULT_ADDRESS } from '@/lib/vault'

interface Props {
    onUploaded?: (docId: string) => void
}

type Step = 'idle' | 'encrypting' | 'uploading' | 'registering' | 'done' | 'error'

export default function DocumentUpload({ onUploaded }: Props) {
    const { address } = useAccount()
    const { signMessageAsync } = useSignMessage()
    const { writeContractAsync } = useWriteContract()
    const cofheClient = useCofheSDK()

    const [step, setStep] = useState<Step>('idle')
    const [error, setError] = useState<string>('')
    const [dragOver, setDragOver] = useState(false)
    const [fileName, setFileName] = useState('')
    const fileRef = useRef<HTMLInputElement>(null)

    const STEP_LABELS: Record<Step, string> = {
        idle: 'Drop a file or click to upload',
        encrypting: '🔐 Encrypting file in browser...',
        uploading: '📦 Uploading encrypted blob to IPFS...',
        registering: '⛓️ Registering on Ethereum Sepolia...',
        done: '✓ Document registered privately',
        error: '✗ Error — see message below',
    }

    async function processFile(file: File) {
        if (!address) { setError('Wallet not connected'); return }
        setFileName(file.name)
        setError('')

        try {
            // ── Step 1: Encrypt file in browser ──────────────────────────────
            setStep('encrypting')
            const fileBytes = await file.arrayBuffer()
            const aesKey = await generateAesKey()
            const { combined: encryptedBlob } = await encryptFile(fileBytes, aesKey)

            // Encrypt AES key for owner's wallet using signature-derived wrapping key
            const signature = await signMessageAsync({ message: KEY_DERIVATION_MESSAGE })
            const aesKeyBytes = await exportAesKey(aesKey)
            const encryptedOwnerKey = await encryptKeyForWallet(aesKeyBytes, signature)

            // ── Step 2: Upload encrypted blob to Pinata IPFS ─────────────────
            setStep('uploading')
            const cid = await uploadEncryptedToIPFS(encryptedBlob, `custos-${Date.now()}`)
            const cidBytes32 = pinataCidToBytes32(cid)

            // ── Step 3: Encrypt metadata with FHE ────────────────────────────
            const now = BigInt(Math.floor(Date.now() / 1000))
            const docId = keccak256(toHex(`${file.name}:${address}:${Date.now()}`))

            if (!cofheClient) throw new Error('CoFHE SDK not initialized — connect wallet first')

            const [encTimestamp, encOwner] = await cofheClient
                .encryptInputs([
                    Encryptable.uint64(now),
                    Encryptable.address(address),
                ])
                .execute()

            // ── Step 4: Register on DocumentVault.sol ────────────────────────
            setStep('registering')
            await writeContractAsync({
                address: VAULT_ADDRESS,
                abi: VAULT_ABI,
                functionName: 'registerDocument',
                args: [
                    docId,
                    encTimestamp as any,
                    encOwner as any,
                    cidBytes32,
                    toHex(encryptedOwnerKey),
                ],
                gas: 5_000_000n, // FHE precompile not in eth_estimateGas — manual limit required
            })

            setStep('done')
            onUploaded?.(docId)
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e))
            setStep('error')
        }
    }

    function onDrop(e: DragEvent) {
        e.preventDefault()
        setDragOver(false)
        const file = e.dataTransfer.files[0]
        if (file) processFile(file)
    }

    function onChange(e: ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (file) processFile(file)
    }

    const isProcessing = ['encrypting', 'uploading', 'registering'].includes(step)

    return (
        <div>
            <div
                onClick={() => !isProcessing && fileRef.current?.click()}
                onDrop={onDrop}
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                style={{
                    border: `2px dashed ${dragOver ? 'var(--accent)' : 'var(--border)'}`,
                    borderRadius: 12,
                    padding: '32px 24px',
                    textAlign: 'center',
                    cursor: isProcessing ? 'wait' : 'pointer',
                    background: dragOver ? 'rgba(99,102,241,0.05)' : 'transparent',
                    transition: 'all 0.2s',
                }}
            >
                <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={onChange} />

                {step === 'idle' && (
                    <>
                        <div style={{ fontSize: 32, marginBottom: 8 }}>📄</div>
                        <div style={{ color: 'var(--text-dim)', marginBottom: 4 }}>Drop a document or click to select</div>
                        <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>PDF, DOCX, TXT — encrypted before upload</div>
                    </>
                )}

                {isProcessing && (
                    <div>
                        <div style={{ fontSize: 24, marginBottom: 8 }}>⏳</div>
                        <div style={{ fontWeight: 600, marginBottom: 4 }}>{STEP_LABELS[step]}</div>
                        {fileName && <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>{fileName}</div>}
                    </div>
                )}

                {step === 'done' && (
                    <div>
                        <div style={{ fontSize: 24, marginBottom: 8 }}>✅</div>
                        <div style={{ color: 'var(--green)', fontWeight: 600 }}>Document registered privately</div>
                        <div style={{ color: 'var(--text-dim)', fontSize: 12, marginTop: 4 }}>File encrypted on IPFS · Metadata FHE-encrypted on Sepolia</div>
                    </div>
                )}

                {step === 'error' && (
                    <div>
                        <div style={{ fontSize: 24, marginBottom: 8 }}>❌</div>
                        <div style={{ color: 'var(--red)', fontWeight: 600 }}>Upload failed</div>
                    </div>
                )}
            </div>

            {/* Encryption flow explanation */}
            {(step === 'encrypting' || step === 'uploading' || step === 'registering') && (
                <div style={{ display: 'flex', gap: 8, marginTop: 12, fontSize: 12, color: 'var(--text-dim)' }}>
                    {[
                        { label: 'AES-256 encrypt', done: ['uploading', 'registering', 'done'].includes(step) },
                        { label: 'IPFS upload', done: ['registering', 'done'].includes(step) },
                        { label: 'FHE register', done: ['done'].includes(step) },
                    ].map((s, i) => (
                        <span key={i} style={{ color: s.done ? 'var(--green)' : 'inherit' }}>
                            {s.done ? '✓' : '○'} {s.label}
                        </span>
                    ))}
                </div>
            )}

            {error && (
                <div style={{ marginTop: 8, padding: '8px 12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, color: 'var(--red)', fontSize: 12 }}>
                    {error}
                </div>
            )}
        </div>
    )
}
