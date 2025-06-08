
import type {NextConfig} from 'next';
import path from 'path'; // Ensure path is imported

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
      
      // Handle general Node.js built-ins with fallback: false
      config.resolve.fallback = {
        ...(config.resolve.fallback || {}), 
        fs: false,                 
        tls: false,                
        net: false,                
        http2: false,              
        dns: false,       
      };
      // async_hooks and node:async_hooks will be handled by alias AND fallback
      config.resolve.fallback.async_hooks = false;
      config.resolve.fallback['node:async_hooks'] = false;

      // Explicitly alias problematic modules to an empty module
      config.resolve.alias = {
        ...(config.resolve.alias || {}),
        'async_hooks': path.resolve(__dirname, 'src/lib/empty-module.ts'),
        'node:async_hooks': path.resolve(__dirname, 'src/lib/empty-module.ts'),
      };
      
      // Suppress errors related to expressions in context (often involves dynamic imports)
      config.module.exprContextCritical = false; 
      
      config.ignoreWarnings = [
        { module: /node:async_hooks/ },
        { module: /async_hooks/ },
      ];
    }
    return config;
  },
};

export default nextConfig;
