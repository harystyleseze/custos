'use client'

import { useState, useEffect } from 'react'
import { useAccount, usePublicClient } from 'wagmi'
import { useRouter } from 'next/navigation'
import { parseAbiItem } from 'viem'
import DocumentUpload from '@/components/DocumentUpload'
import EncryptionStatus from '@/components/EncryptionStatus'
import { VAULT_ADDRESS } from '@/lib/vault'

interface DocEntry {
    docId: string
    ipfsCid: string
    blockNumber: bigint
    txHash: string
}

export default function DashboardContent() {
    const { address, isConnected } = useAccount()
    const router = useRouter()
    const publicClient = usePublicClient()
    const [docs, setDocs] = useState<DocEntry[]>([])
    const [loading, setLoading] = useState(true)

    // Fetch documents from on-chain events (persistent across page refresh)
    useEffect(() => {
        if (!publicClient || !isConnected) return

        async function fetchDocuments() {
            setLoading(true)
            try {
                // Query DocumentRegistered events from the contract
                const logs = await publicClient!.getLogs({
                    address: VAULT_ADDRESS,
                    event: parseAbiItem('event DocumentRegistered(bytes32 indexed docId, bytes32 ipfsCid)'),
                    fromBlock: 'earliest',
                    toBlock: 'latest',
                })

                const entries: DocEntry[] = logs.map(log => ({
                    docId: log.args.docId as string,
                    ipfsCid: log.args.ipfsCid as string,
                    blockNumber: log.blockNumber,
                    txHash: log.transactionHash,
                })).reverse() // newest first

                setDocs(entries)
            } catch (e) {
                console.error('Failed to fetch documents from chain:', e)
            }
            setLoading(false)
        }

        fetchDocuments()
    }, [publicClient, isConnected])

    if (!isConnected) {
        router.push('/')
        return null
    }

    function onDocUploaded(docId: string) {
        // Optimistically add to list (will also appear on next event query)
        setDocs(prev => [{
            docId,
            ipfsCid: '',
            blockNumber: 0n,
            txHash: '',
        }, ...prev])
    }

    return (
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 20px' }}>
            {/* Top bar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <img src="/logo.png" alt="Custos" style={{ width: 32, height: 32, borderRadius: 8 }} />
                    <span style={{ fontWeight: 700, fontSize: 18 }}>Custos</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span className="badge badge-green">● Sepolia</span>
                    <span style={{ color: 'var(--text-dim)', fontSize: 13 }} className="mono">
                        {address?.slice(0, 6)}...{address?.slice(-4)}
                    </span>
                </div>
            </div>

            {/* System Status Bar */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
                <StatusPill label="Wallet" ok={isConnected} />
                <StatusPill label="Network" ok={true} detail="Sepolia" />
                <StatusPill label="Contract" ok={VAULT_ADDRESS !== '0x0000000000000000000000000000000000000000'} detail={VAULT_ADDRESS.slice(0, 8) + '...'} />
                <StatusPill label="Documents" ok={!loading} detail={loading ? 'Loading...' : `${docs.length} on-chain`} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 24, alignItems: 'start' }}>
                {/* Left: Upload + Document list */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    {/* Upload */}
                    <div className="card">
                        <div style={{ fontWeight: 600, marginBottom: 16 }}>Upload Document</div>
                        <DocumentUpload onUploaded={onDocUploaded} />
                    </div>

                    {/* Document list */}
                    <div className="card">
                        <div style={{ fontWeight: 600, marginBottom: 16 }}>
                            Your Documents
                            <span style={{ color: 'var(--text-dim)', fontWeight: 400, fontSize: 13, marginLeft: 8 }}>
                                ({docs.length} registered on Sepolia)
                            </span>
                        </div>

                        {loading ? (
                            <div style={{ color: 'var(--text-dim)', fontSize: 13, textAlign: 'center', padding: '32px 0' }}>
                                Querying on-chain events...
                            </div>
                        ) : docs.length === 0 ? (
                            <div style={{ color: 'var(--text-dim)', fontSize: 13, textAlign: 'center', padding: '32px 0' }}>
                                No documents found on-chain. Upload one above.
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {docs.map((doc, i) => (
                                    <div
                                        key={doc.docId}
                                        onClick={() => router.push(`/dashboard/${doc.docId}`)}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 12,
                                            padding: '12px 14px',
                                            background: 'var(--surface-2)',
                                            borderRadius: 8,
                                            cursor: 'pointer',
                                            border: '1px solid var(--border)',
                                        }}
                                    >
                                        <span style={{ fontSize: 20 }}>📄</span>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontWeight: 500, fontSize: 13 }}>Document #{docs.length - i}</div>
                                            <div style={{ color: 'var(--text-dim)', fontSize: 11 }} className="mono">
                                                {doc.docId.slice(0, 14)}...{doc.docId.slice(-6)}
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                                            <span className="badge badge-purple" style={{ fontSize: 11 }}>FHE encrypted</span>
                                            {doc.txHash && (
                                                <a
                                                    href={`https://sepolia.etherscan.io/tx/${doc.txHash}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    onClick={e => e.stopPropagation()}
                                                    style={{ color: 'var(--accent)', fontSize: 10, textDecoration: 'none' }}
                                                >
                                                    View tx ↗
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Right: Privacy status */}
                <div>
                    <EncryptionStatus />

                    {/* Protocol info */}
                    <div className="card" style={{ marginTop: 16 }}>
                        <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 13 }}>FHE Stack</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12, color: 'var(--text-dim)' }}>
                            {[
                                { label: 'Network', value: 'Ethereum Sepolia', link: true },
                                { label: 'FHE Library', value: '@fhenixprotocol/cofhe-contracts' },
                                { label: 'SDK', value: '@cofhe/sdk v0.4.0' },
                                { label: 'AI Model', value: 'phi-4-mini (local Ollama)' },
                                { label: 'Embeddings', value: 'multilingual-e5-small (WASM)' },
                                { label: 'Storage', value: 'Pinata IPFS (encrypted blobs)' },
                            ].map(item => (
                                <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span>{item.label}</span>
                                    <span style={{ color: 'var(--text)', fontFamily: item.link ? 'inherit' : 'monospace', fontSize: item.link ? 12 : 11 }}>
                                        {item.value}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

// Status indicator pill (like Walnut's approach)
function StatusPill({ label, ok, detail }: { label: string; ok: boolean; detail?: string }) {
    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 10px',
            background: ok ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
            border: `1px solid ${ok ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
            borderRadius: 6,
            fontSize: 11,
            color: ok ? 'rgb(34,197,94)' : 'rgb(239,68,68)',
        }}>
            <span style={{ fontSize: 8 }}>{ok ? '●' : '○'}</span>
            <span style={{ fontWeight: 600 }}>{label}</span>
            {detail && <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>{detail}</span>}
        </div>
    )
}
