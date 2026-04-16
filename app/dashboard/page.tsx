import dynamic from 'next/dynamic'

// Dashboard imports wagmi which references `window` at module load.
// Wrapping with ssr:false prevents server-side prerendering.
const DashboardContent = dynamic(() => import('./DashboardContent'), { ssr: false })

export default function DashboardPage() {
    return <DashboardContent />
}
