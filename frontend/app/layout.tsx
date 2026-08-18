import type { Metadata } from "next";
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
  title: "Shubh Real Estates | Auspicious Luxury Living & Advisory",
  description: "Curators of prime real estate assets and bespoke advisory powered by Gemini AI.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} antialiased dark`}
    >
      <body className="min-h-screen bg-[#0B0B0A] text-[#F1EEE7] overflow-x-hidden selection:bg-[#C5A880]/20 selection:text-[#F1EEE7]">
        {children}
      </body>
    </html>
  );
}
