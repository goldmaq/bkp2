
import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
    ],
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Prevent bundling of Node.js-specific modules for the client
      config.resolve.fallback = {
        ...config.resolve.fallback, // Important to spread existing fallbacks
        async_hooks: false,        // For 'async_hooks'
        'node:async_hooks': false, // Explicitly for 'node:async_hooks'
        fs: false,                 // Mocks 'fs' for client-side
        tls: false,                // Mocks 'tls' for client-side
        net: false,                // Mocks 'net' for client-side
        http2: false,              // Mocks 'http2' for client-side
        dns: false,                // Mocks 'dns' for client-side
      };
      // The alias for 'async_hooks' is removed as fallback is more appropriate here.
      // If config.resolve.alias existed for other reasons, it would be preserved,
      // but in the current setup, it was only for async_hooks.
    }
    return config;
  },
};

export default nextConfig;
