//@ts-check
const {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
} = require('node:fs');
const { dirname, join } = require('node:path');

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'same-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(self), microphone=(), geolocation=(), payment=()',
  },
  { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
];

// The scanner loads its decoder from /zxing/<version>/ because the CSP forbids CDNs.
function copyScannerWasm() {
  const shell = join(__dirname, '../../libs/web-platform/shell');
  const detector = require.resolve('barcode-detector', { paths: [shell] });
  const wasm = require.resolve('zxing-wasm/reader/zxing_reader.wasm', {
    paths: [dirname(detector)],
  });
  const pkg = join(dirname(wasm), '../../package.json');
  const { version } = JSON.parse(readFileSync(pkg, 'utf8'));
  const target = join(__dirname, 'public/zxing', version, 'zxing_reader.wasm');
  if (existsSync(target) && statSync(target).size === statSync(wasm).size)
    return;
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(wasm, target);
}
copyScannerWasm();

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone output needs symlinks, which Windows blocks without Developer Mode.
  output:
    process.env['NEXT_OUTPUT'] === 'standalone' ? 'standalone' : undefined,
  outputFileTracingRoot: join(__dirname, '../..'),
  transpilePackages: [
    '@dax/inventory-contract',
    '@dax/parties-contract',
    '@dax/platform-contract',
    '@dax/web-data-access',
    '@dax/web-shell',
  ],
  poweredByHeader: false,
  reactStrictMode: true,
  productionBrowserSourceMaps: false,
  experimental: {
    // CSV imports go through server actions; files are capped at 2 MB.
    serverActions: { bodySizeLimit: '3mb' },
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache' },
          { key: 'Content-Type', value: 'text/javascript; charset=utf-8' },
        ],
      },
      {
        source: '/zxing/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
          { key: 'Content-Type', value: 'application/wasm' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
