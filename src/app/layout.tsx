import type { Metadata, Viewport } from 'next';
import './globals.css';

const description = 'A rainy Kerala bus ride in 3D. Every stop is a focus session and the conductor calls your break.';

// the preview image itself is src/app/opengraph-image.jpg (picked up by Next.js)
export const metadata: Metadata = {
  metadataBase: new URL('https://aanavandi-window-seat.vercel.app'),
  title: 'Aanavandi Window Seat',
  description,
  openGraph: {
    title: 'ആനവണ്ടി · Window Seat',
    description,
    siteName: 'Aanavandi Window Seat',
    type: 'website',
    locale: 'en_IN',
  },
  twitter: { card: 'summary_large_image', title: 'ആനവണ്ടി · Window Seat', description },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#120c08',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+Malayalam:wght@500;700;800&family=Courier+Prime:wght@400;700&family=Sora:wght@400;600;700&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
