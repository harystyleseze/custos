'use client'

/**
 * Visual indicator showing exactly what is encrypted and where.
 * This is the "privacy dashboard" that builds user trust.
 */

interface Layer {
    label: string
    description: string
    tech: string
    status: 'encrypted' | 'public' | 'local'
}

const LAYERS: Layer[] = [
    {
        label: 'File Content',
        description: 'AES-256-GCM encrypted in browser before upload',
        tech: 'Web Crypto API',
        status: 'encrypted',
    },
    {
        label: 'Document Owner',
        description: 'eaddress — FHE-encrypted on Ethereum Sepolia',
        tech: 'Fhenix CoFHE',
        status: 'encrypted',
    },
    {
        label: 'Access Expiry Times',
        description: 'euint64 — FHE-encrypted, nobody sees when access expires',
        tech: 'FHE.asEuint64()',
        status: 'encrypted',
    },
    {
        label: 'Access Check Result',
        description: 'ebool — encrypted, only caller can decrypt their own status',
        tech: 'FHE.gt() + FHE.allowSender()',
        status: 'encrypted',
    },
    {
        label: 'AI Query Content',
        description: 'phi-4-mini runs locally via Ollama — never transmitted',
        tech: 'Ollama localhost',
        status: 'local',
    },
    {
        label: 'Search Embeddings',
        description: 'e5-small WASM in browser — vectors never leave device',
        tech: '@xenova/transformers',
        status: 'local',
    },
    {
        label: 'IPFS CID',
        description: 'Public — but blob is ciphertext, useless without AES key',
        tech: 'Pinata IPFS',
        status: 'public',
    },
    {
        label: 'Query Audit Hash',
        description: 'keccak256(query + timestamp) — proves audit, hides content',
        tech: 'Ethereum Sepolia',
        status: 'public',
    },
]

const STATUS_COLORS = {
    encrypted: { bg: 'rgba(99,102,241,0.1)', border: 'rgba(99,102,241,0.3)', dot: '#6366f1', label: 'FHE Encrypted' },
    local: { bg: 'rgba(34,197,94,0.1)', border: 'rgba(34,197,94,0.3)', dot: '#22c55e', label: 'Local Only' },
    public: { bg: 'rgba(234,179,8,0.1)', border: 'rgba(234,179,8,0.3)', dot: '#eab308', label: 'Public (safe)' },
}

export default function EncryptionStatus() {
    return (
        <div className="card">
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Privacy Layers</div>
            <div style={{ color: 'var(--text-dim)', fontSize: 12, marginBottom: 16 }}>
                Every data type and where/how it&apos;s protected
            </div>

            {/* Legend */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                {Object.entries(STATUS_COLORS).map(([key, val]) => (
                    <span key={key} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-dim)' }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: val.dot, display: 'inline-block' }} />
                        {val.label}
                    </span>
                ))}
            </div>

            {/* Layers */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {LAYERS.map(layer => {
                    const colors = STATUS_COLORS[layer.status]
                    return (
                        <div
                            key={layer.label}
                            style={{
                                display: 'flex',
                                gap: 12,
                                alignItems: 'flex-start',
                                padding: '10px 12px',
                                background: colors.bg,
                                border: `1px solid ${colors.border}`,
                                borderRadius: 8,
                            }}
                        >
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: colors.dot, marginTop: 5, flexShrink: 0 }} />
                            <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ fontWeight: 600, fontSize: 13 }}>{layer.label}</span>
                                    <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-dim)', background: 'var(--surface-2)', padding: '1px 6px', borderRadius: 4 }}>
                                        {layer.tech}
                                    </span>
                                </div>
                                <div style={{ color: 'var(--text-dim)', fontSize: 12, marginTop: 2 }}>{layer.description}</div>
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
