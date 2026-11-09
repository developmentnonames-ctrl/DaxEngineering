import '@mantine/core/styles.css';
import '@dax/web-shell/styles.css';
import './global.css';
import { mantineHtmlProps } from '@mantine/core';
import { headers } from 'next/headers';
import Script from 'next/script';
import { THEME_SCRIPT } from '@dax/web-shell/server';
import { DaxProvider } from '@dax/web-shell';
import { fontVariables } from '@dax/web-shell/fonts';
import { PRODUCT } from '../lib/server';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: PRODUCT,
  description: 'Users and settings',
  robots: { index: false, follow: false },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={fontVariables} {...mantineHtmlProps}>
      <head>
        <Script
          id="dax-theme"
          strategy="beforeInteractive"
          nonce={(await headers()).get('x-nonce') ?? undefined}
        >
          {THEME_SCRIPT}
        </Script>
      </head>
      <body>
        <DaxProvider>{children}</DaxProvider>
      </body>
    </html>
  );
}
