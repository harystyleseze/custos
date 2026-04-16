import { ReactNode } from 'react'
import dynamic from 'next/dynamic'
import './globals.css'

// Dynamically import providers with SSR disabled.
// wagmi and wallet SDKs reference `window` at module import time
// which breaks Next.js static page generation (Node.js has no `window`).
const Providers = dynamic(() => import('./providers'), { ssr: false })

export const metadata = {
    title: 'Custos — Privacy-Native Document Intelligence',
    description: 'Share confidential documents and get AI insights — even WHO has access is encrypted on-chain.',
    icons: {
        icon: [
            { url: '/favicon.ico', sizes: 'any' },
            { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
            { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
        ],
        apple: '/apple-touch-icon.png',
    },
}

export default function RootLayout({ children }: { children: ReactNode }) {
    return (
        <html lang="en">
            <body>
                <Providers>{children}</Providers>
            </body>
        </html>
    )
}
