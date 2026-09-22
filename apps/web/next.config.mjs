/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: ['@job-radar/core', '@job-radar/db', '@job-radar/jobs'],
  serverExternalPackages: ['@ai-sdk/google-vertex', 'google-auth-library', 'pino', 'postgres'],
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        child_process: false,
      };
    }
    return config;
  },
};

export default nextConfig;
