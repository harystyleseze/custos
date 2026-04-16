'use client'

import { use } from 'react'
import dynamic from 'next/dynamic'

const DocViewerContent = dynamic(() => import('./DocViewerContent'), { ssr: false })

export default function DocumentPage({ params }: { params: Promise<{ docId: string }> }) {
    const { docId } = use(params)
    return <DocViewerContent docId={docId} />
}
