import './globals.css';

export const metadata = {
  title: 'PL Predictor',
  description: 'Premier League 2026/27 prediction competition',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#0b0f14',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
