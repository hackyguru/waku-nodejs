/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/api/waku/:path*',
        destination: 'http://127.0.0.1:8645/:path*',
      },
    ];
  },
};

export default nextConfig;
