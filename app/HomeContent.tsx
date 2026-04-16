'use client'

import { useAccount } from 'wagmi'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function HomeContent() {
    const { address, isConnected } = useAccount()
    const router = useRouter()

    useEffect(() => {
        if (isConnected) router.push('/dashboard')
    }, [isConnected, router])

    return (
        <main style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
            {/* Logo / Hero */}
            <div style={{ maxWidth: 600, textAlign: 'center' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
                    <img src="/logo.png" alt="Custos" style={{ width: 44, height: 44, borderRadius: 10 }} />
                    <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.5px' }}>Custos</span>
                </div>

                <h1 style={{ fontSize: 42, fontWeight: 800, lineHeight: 1.15, letterSpacing: '-1px', marginBottom: 16 }}>
                    AI document analysis.<br />
                    <span style={{ color: 'var(--accent)' }}>Zero data exposure.</span>
                </h1>

                <p style={{ color: 'var(--text-dim)', fontSize: 16, lineHeight: 1.7, marginBottom: 32 }}>
                    Share confidential documents with colleagues. Get AI insights from phi-4.
                    Even <strong style={{ color: 'var(--text)' }}>who you share with stays encrypted</strong> — not just the files.
                    Built on Fhenix FHE on Ethereum Sepolia.
                </p>

                {/* Feature pills */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 40 }}>
                    {[
                        { icon: '🔒', label: 'AES-256-GCM files' },
                        { icon: '🧠', label: 'FHE access control' },
                        { icon: '🤖', label: 'phi-4-mini AI (local)' },
                        { icon: '🔍', label: 'e5-small search (browser)' },
                        { icon: '📦', label: 'IPFS via Pinata' },
                    ].map(f => (
                        <span key={f.label} className="badge badge-dim" style={{ padding: '6px 12px', fontSize: 13 }}>
                            {f.icon} {f.label}
                        </span>
                    ))}
                </div>

                {/* The privacy guarantee */}
                <div className="card" style={{ textAlign: 'left', marginBottom: 32, borderColor: 'var(--accent)', background: 'rgba(99,102,241,0.05)' }}>
                    <div style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>The Privacy Guarantee</div>
                    <div style={{ color: 'var(--text-dim)', fontSize: 13, lineHeight: 1.8 }}>
                        <div>✓ Documents encrypted in your browser before upload</div>
                        <div>✓ AI analysis runs locally — no API call, no data exposure</div>
                        <div>✓ Access control encrypted on-chain via <strong style={{ color: 'var(--text)' }}>Fhenix FHE</strong></div>
                        <div>✓ Even WHO you share with is hidden from the blockchain</div>
                        <div>✓ Revoke access instantly — cryptographically enforced</div>
                    </div>
                </div>

                {/* Who it's for */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 40, textAlign: 'left' }}>
                    {[
                        { icon: '⚖️', role: 'Lawyers', pain: 'ABA ethics compliance for AI' },
                        { icon: '🏥', role: 'Healthcare', pain: 'HIPAA-safe document AI' },
                        { icon: '📊', role: 'Finance', pain: 'M&A confidentiality' },
                    ].map(v => (
                        <div key={v.role} className="card" style={{ padding: 14 }}>
                            <div style={{ fontSize: 20, marginBottom: 6 }}>{v.icon}</div>
                            <div style={{ fontWeight: 600, marginBottom: 2 }}>{v.role}</div>
                            <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>{v.pain}</div>
                        </div>
                    ))}
                </div>

                {/* Connect — RainbowKit provides MetaMask, Coinbase Wallet, WalletConnect, etc. */}
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <ConnectButton label="Connect Wallet → Get Started" />
                </div>

                <div style={{ marginTop: 24, color: 'var(--text-dim)', fontSize: 12 }}>
                    Supports MetaMask, Coinbase Wallet, WalletConnect and more on <strong>Ethereum Sepolia</strong>
                </div>
            </div>
        </main>
    )
}
