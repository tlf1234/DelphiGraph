/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  // 性能优化配置
  compiler: {
    // 移除console.log（生产环境）
    removeConsole: process.env.NODE_ENV === 'production' ? {
      exclude: ['error', 'warn'],
    } : false,
  },
  // 图片优化
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
  // 压缩
  compress: true,
  // 生产环境优化
  productionBrowserSourceMaps: false,
  // React严格模式
  reactStrictMode: true,
  // SWC压缩
  swcMinify: true,
}

module.exports = nextConfig

