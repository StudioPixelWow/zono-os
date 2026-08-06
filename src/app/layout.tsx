import type { Metadata } from "next";
import "./globals.css";

// Offline-safe font strategy: no build-time network fetch to Google Fonts.
// We expose the same `--font-heebo` CSS variable used across the app, resolved
// to a Hebrew-capable system font stack (Heebo/Assistant when locally present,
// otherwise system-ui / Arial Hebrew). Swap for `next/font/local` if a licensed
// Heebo .woff2 is added under the repo later — no other code needs to change.
const HEEBO_STACK =
  "'Heebo','Assistant','Rubik',system-ui,-apple-system,'Segoe UI','Arial Hebrew',Arial,sans-serif";
const heeboStyle = { "--font-heebo": HEEBO_STACK } as React.CSSProperties;

export const metadata: Metadata = {
  title: 'ZONO — מערכת ההפעלה החכמה לסוכני נדל"ן',
  description:
    'ZONO היא מערכת הפעלה מבוססת בינה מלאכותית לסוכני נדל"ן בישראל: ניהול לקוחות, התאמות חכמות, מסע הנכס וזיהוי הזדמנויות בשוק.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl" className="h-full antialiased" style={heeboStyle}>
      <body className="min-h-full flex flex-col bg-surface text-ink font-sans">
        {children}
      </body>
    </html>
  );
}
