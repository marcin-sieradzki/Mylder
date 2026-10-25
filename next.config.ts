import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Perron is imported from its barrel, the only entry it exports; this keeps the bundle to the
  // components a page uses.
  experimental: { optimizePackageImports: ['@mylder/perron'] },
}

export default nextConfig
