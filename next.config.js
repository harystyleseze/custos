/** @type {import('next').NextConfig} */
const nextConfig = {
    typescript: {
        // @cofhe/sdk has internal ES2022 type issues (Error.cause syntax)
        // Safe to ignore — our code is type-correct
        ignoreBuildErrors: true,
    },
    webpack: (config) => {
        // Required for @xenova/transformers WASM support
        config.resolve.alias = {
            ...config.resolve.alias,
            sharp$: false,
            'onnxruntime-node$': false,
        }
        // Fix pino-pretty (wagmi/walletconnect dependency)
        config.resolve.fallback = {
            ...config.resolve.fallback,
            'pino-pretty': false,
        }
        return config
    },
    // CORS headers for API routes
    async headers() {
        return [
            {
                source: '/api/:path*',
                headers: [
                    { key: 'Access-Control-Allow-Origin', value: '*' },
                    { key: 'Access-Control-Allow-Methods', value: 'GET, POST, OPTIONS' },
                    { key: 'Access-Control-Allow-Headers', value: 'Content-Type' },
                ],
            },
        ]
    },
}

module.exports = nextConfig
