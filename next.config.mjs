/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // 부스 카메라 미리보기(모의/실제)를 위해 같은 출처의 카메라·마이크 사용 허용
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self)' },
        ],
      },
    ];
  },
};

export default nextConfig;
