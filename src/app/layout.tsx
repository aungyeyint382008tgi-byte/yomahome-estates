import type { Metadata, Viewport } from "next";
import { Playfair_Display, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  weight: ["500", "600", "700"],
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  weight: ["400", "500", "600", "700"],
});

export const viewport: Viewport = {
  themeColor: "#0B0C10",
};

export const metadata: Metadata = {
  title: "YomaHome Estates — Yangon Curated Real Estate",
  description: "Curated luxury residences, villas, and penthouses in Yangon.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${playfair.variable} ${jakarta.variable} dark h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#0B0C10] text-[#F5F2EB] font-sans selection:bg-[#D4AF37]/30 selection:text-[#F5E6B3]">
        {children}
      </body>
    </html>
  );
}
