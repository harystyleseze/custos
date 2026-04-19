'use client'

import { Encryptable, FheTypes } from '@cofhe/sdk'

// Re-export SDK types for convenience
export { Encryptable, FheTypes }

/**
 * Create a CoFHE SDK client on-demand.
 * Called each time FHE encryption/decryption is needed.
 *
 * This avoids React context timing issues — the client is created fresh
 * with the current publicClient and walletClient from wagmi.
 */
export async function createCofheSDKClient(publicClient: any, walletClient: any) {
    if (typeof window === 'undefined') {
        throw new Error('CoFHE SDK requires browser environment')
    }

    const { createCofheConfig, createCofheClient } = await import('@cofhe/sdk/web')
    const { chains } = await import('@cofhe/sdk/chains')

    const config = createCofheConfig({
        supportedChains: [chains.sepolia],
        defaultPermitExpiration: 60 * 60 * 24 * 30,
    })

    const client = createCofheClient(config)
    await client.connect(publicClient, walletClient)

    return client
}
