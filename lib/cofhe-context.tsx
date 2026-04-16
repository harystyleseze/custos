'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { usePublicClient, useWalletClient } from 'wagmi'
import { createCofheConfig, createCofheClient } from '@cofhe/sdk/web'
import { chains } from '@cofhe/sdk/chains'
import { Encryptable, FheTypes } from '@cofhe/sdk'

// Re-export SDK types for convenience
export { Encryptable, FheTypes }

const cofheConfig = createCofheConfig({
    supportedChains: [chains.sepolia],
    defaultPermitExpiration: 60 * 60 * 24 * 30, // 30 days
})

type CofheClientType = ReturnType<typeof createCofheClient>

const CofheContext = createContext<CofheClientType | null>(null)

/**
 * Provides the CoFHE SDK client to all child components.
 * Initializes once when wallet connects, reconnects on wallet change.
 * Replaces @cofhe/react CofheProvider (which is deprecated / v0.3.x only).
 */
export function CofheSDKProvider({ children }: { children: ReactNode }) {
    const publicClient = usePublicClient()
    const { data: walletClient } = useWalletClient()
    const [cofheClient, setCofheClient] = useState<CofheClientType | null>(null)

    useEffect(() => {
        if (!publicClient || !walletClient) {
            setCofheClient(null)
            return
        }

        const client = createCofheClient(cofheConfig)

        client.connect(publicClient as any, walletClient as any)
            .then(() => {
                setCofheClient(client)
            })
            .catch(err => {
                console.warn('CoFHE SDK connection failed:', err)
                // Still set client — encryption works without full connection
                setCofheClient(client)
            })
    }, [publicClient, walletClient])

    return (
        <CofheContext.Provider value={cofheClient}>
            {children}
        </CofheContext.Provider>
    )
}

/**
 * Hook to access the CoFHE SDK client.
 * Returns null if wallet not connected yet.
 */
export function useCofheSDK(): CofheClientType | null {
    return useContext(CofheContext)
}
