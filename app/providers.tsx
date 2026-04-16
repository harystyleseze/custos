'use client'

import { ReactNode } from 'react'
import { WagmiProvider, http } from 'wagmi'
import { sepolia } from 'wagmi/chains'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { getDefaultConfig, RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit'
import '@rainbow-me/rainbowkit/styles.css'
import { CofheSDKProvider } from '@/lib/cofhe-context'

const config = getDefaultConfig({
    appName: 'Custos',
    projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'custos-demo',
    chains: [sepolia],
    transports: {
        [sepolia.id]: http(),
    },
})

const queryClient = new QueryClient()

export default function Providers({ children }: { children: ReactNode }) {
    return (
        <WagmiProvider config={config}>
            <QueryClientProvider client={queryClient}>
                <RainbowKitProvider theme={darkTheme({ accentColor: '#6366f1' })}>
                    <CofheSDKProvider>
                        {children}
                    </CofheSDKProvider>
                </RainbowKitProvider>
            </QueryClientProvider>
        </WagmiProvider>
    )
}
