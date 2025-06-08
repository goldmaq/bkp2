
import type {NextConfig} from 'next';
import path from 'path'; // Keep for other potential future aliases

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
      // Ensure resolve and fallback objects exist and are properly initialized
      config.resolve = config.resolve || {};
      config.resolve.fallback = {
        ...(config.resolve.fallback || {}), // Spread any existing fallbacks first
        fs: false,                 
        tls: false,                
        net: false,                
        http2: false,              
        dns: false,
        'async_hooks': false,       // Explicitly set async_hooks to false in fallback
        'node:async_hooks': false,  // Explicitly set node:async_hooks to false in fallback
      };

      // Ensure alias object exists and explicitly set aliases to false
      config.resolve.alias = config.resolve.alias || {};
      config.resolve.alias['async_hooks'] = false;
      config.resolve.alias['node:async_hooks'] = false;
      
      // Suppress errors related to expressions in context (often involves dynamic imports)
      config.module.exprContextCritical = false; 
    }
    return config;
  },
};

export default nextConfig;
