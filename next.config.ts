import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  typedRoutes: true,

  // SSG 构建超时（大量页面预渲染需要）
  staticPageGenerationTimeout: 300,

  // HTTP 响应头缓存策略
  async headers() {
    return [
      // Next.js 构建产物（哈希文件名）→ 永久缓存
      {
        source: '/_next/static/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      // API 路由不缓存
      {
        source: '/api/:path*',
        headers: [{ key: 'Cache-Control', value: 'no-store, no-cache' }],
      },
      // 所有内容页：Vercel CDN 边缘缓存 24h，后台 7 天 revalidate
      {
        source: '/((?!api|_next).*)',
        headers: [{ key: 'Cache-Control', value: 'public, s-maxage=86400, stale-while-revalidate=604800' }],
      },
    ];
  },

  async redirects() {
    return [
      {
        source: '/company/:slug/osha',
        destination: '/company/:slug#osha-records',
        permanent: true,
      },
      {
        source: '/company/:slug/license',
        destination: '/company/:slug#license-records',
        permanent: true,
      },
      {
        source: '/company/:slug/registration',
        destination: '/company/:slug#registration-records',
        permanent: true,
      },
      {
        source: '/state/:stateSlug/osha',
        destination: '/state/:stateSlug#osha-records',
        permanent: true,
      },
      {
        source: '/state/:stateSlug/licenses',
        destination: '/state/:stateSlug#license-records',
        permanent: true,
      },
      {
        source: '/state/:stateSlug/registrations',
        destination: '/state/:stateSlug#registration-records',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
