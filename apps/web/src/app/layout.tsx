import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "BusinessOps",
  description: "Job, staff, and cost management for tradespeople",
  // Title shown under the icon once installed to an iOS home screen.
  appleWebApp: { capable: true, title: "BusinessOps", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  // Paints the phone's status bar to match the app instead of leaving a white
  // strip above a dark UI. Two entries so it tracks the user's system theme.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0c" },
  ],
  // Lets content sit under the notch and home indicator, which is what makes an
  // installed app look native rather than letterboxed.
  viewportFit: "cover",
  // Deliberately NOT disabling zoom. Pinch-to-zoom is an accessibility
  // requirement, and the 16px input rule in globals.css already stops iOS
  // auto-zooming on focus, which is the problem people usually reach for
  // maximumScale to solve.
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
