import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Perron's tokens.ts is a raw TypeScript file; Next compiles it only when the package is listed here.
  transpilePackages: ['@mylder/perron'],
}

export default nextConfig
