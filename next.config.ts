
import type {NextConfig} from 'next';
import path from 'path'; // Importar o módulo path

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
        // async_hooks and node:async_hooks removed from here, handled by alias
        fs: false,                 
        tls: false,                
        net: false,                
        http2: false,              
        dns: false,                
      };
      
      config.resolve.alias = {
        ...config.resolve.alias,
        // Aponta 'node:async_hooks' para um módulo vazio real
        'node:async_hooks': path.resolve(__dirname, 'src/lib/empty-module.ts'),
        // Manter o alias para async_hooks simples também pode ser útil
        'async_hooks': path.resolve(__dirname, 'src/lib/empty-module.ts'),
      };
    }
    return config;
  },
};

export default nextConfig;
