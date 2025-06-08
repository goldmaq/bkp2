
import type {NextConfig} from 'next';
import path from 'path'; // Ensure path module is imported

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
        // fs, tls, net, http2, dns are handled by fallback: false
        fs: false,                 
        tls: false,                
        net: false,                
        http2: false,              
        dns: false,
        // async_hooks and node:async_hooks will be handled by alias below, so remove from fallback
      };

      // Suppress errors related to expressions in context (often involves dynamic imports)
      // This can be useful but also mask issues if not understood. Keeping it for now.
      config.module.exprContextCritical = false;

      config.resolve.alias = {
        ...config.resolve.alias,
        // Point 'node:async_hooks' and 'async_hooks' to a real empty module for client-side
        'node:async_hooks': path.resolve(__dirname, 'src/lib/empty-module.ts'),
        'async_hooks': path.resolve(__dirname, 'src/lib/empty-module.ts'),
      };
    }
    return config;
  },
};

export default nextConfig;
