import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    typedRoutes: true,
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
