import '@mantine/core/styles.css';
import '@dax/web-shell/styles.css';
import './global.css';
import { mantineHtmlProps } from '@mantine/core';
import { headers } from 'next/headers';
import { THEME_SCRIPT } from '@dax/web-shell/server';
import { DaxProvider } from '@dax/web-shell';
import { fontVariables } from '@dax/web-shell/fonts';
import { PRODUCT } from '../lib/server';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: PRODUCT,
  description: 'Users and settings',
  robots: { index: false, follow: false },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '48x48' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={fontVariables} {...mantineHtmlProps}>
      <head>
        {/* Sets light/dark before first paint. A plain server-rendered tag:
            next/script also renders it on the client, where React warns that
            it never runs. THEME_SCRIPT is a fixed string, not user input.
            Browsers hide the nonce after load, hence suppressHydrationWarning. */}
        <script
          id="dax-theme"
          nonce={(await headers()).get('x-nonce') ?? undefined}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }}
        />
      </head>
      <body>
        <DaxProvider>{children}</DaxProvider>
      </body>
    </html>
  );
}
