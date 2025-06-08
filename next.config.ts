
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
        ...config.resolve.fallback,
        async_hooks: false, // Mocks 'async_hooks' for client-side
      };
    }
    return config;
  },
};

export default nextConfig;
