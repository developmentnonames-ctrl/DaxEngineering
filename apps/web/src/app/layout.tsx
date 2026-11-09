import '@mantine/core/styles.css';
import '@dax/web-shell/styles.css';
import './global.css';
import { ColorSchemeScript, mantineHtmlProps } from '@mantine/core';
import type { Metadata, Viewport } from 'next';
import { DaxProvider } from '@dax/web-shell';
import { fontVariables } from '@dax/web-shell/fonts';
import { ServiceWorkerRegistration } from '../components/service-worker';
import { PRODUCT, THEME_COLOR } from '../lib/server';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: PRODUCT,
  description: 'Stores and inventory',
  robots: { index: false, follow: false },
  applicationName: PRODUCT,
  appleWebApp: { capable: true, title: 'DAX', statusBarStyle: 'default' },
  icons: {
    icon: [{ url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
};

export const viewport: Viewport = {
  themeColor: THEME_COLOR,
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={fontVariables} {...mantineHtmlProps}>
      <head>
        <ColorSchemeScript defaultColorScheme="auto" />
      </head>
      <body>
        <DaxProvider>{children}</DaxProvider>
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
