import './global.css';

export const metadata = {
  title: 'DAX Stores',
  description: 'Stores and inventory',
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
