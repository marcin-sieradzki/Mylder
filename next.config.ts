import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Perron's components come from its barrel, the only entry that exports them; this keeps the
  // bundle to the components a page uses.
  experimental: { optimizePackageImports: ['@mylder/perron'] },
}

export default nextConfig
