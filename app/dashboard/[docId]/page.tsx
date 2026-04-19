'use client'

import { use } from 'react'
import dynamic from 'next/dynamic'

const DocViewerContent = dynamic(() => import('./DocViewerContent'), { ssr: false })

export default function DocumentPage({ params }: { params: Promise<{ docId: string }> | { docId: string } }) {
    // params may be a Promise (Next.js 15) or a plain object (client-side navigation)
    const resolved = params instanceof Promise ? use(params) : params
    const { docId } = resolved
    return <DocViewerContent docId={docId} />
}
