import type { Metadata } from "next";
import { AuthProvider } from "@/components/AuthProvider";
import { DJPlayerProvider } from "@/components/dj/DJPlayerProvider";
import { Footer } from "@/components/Footer";
import { TwemojiRoot } from "@/components/TwemojiRoot";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aura-board",
  description: "Classroom workspace",
  metadataBase: new URL("https://aura-teacher.com"),
  icons: {
    icon: "/aura-app-icon-512.png",
    apple: "/aura-app-icon-512.png",
  },
  openGraph: {
    title: "Aura-board",
    description: "Classroom workspace",
    url: "https://aura-teacher.com",
    siteName: "Aura-board",
    images: [
      {
        url: "/aura-board-og.png",
        width: 1200,
        height: 630,
        alt: "Aura-board Classroom workspace",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Aura-board",
    description: "Classroom workspace",
    images: ["/aura-board-og.png"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>
        <TwemojiRoot />
        <AuthProvider>
          <DJPlayerProvider>{children}</DJPlayerProvider>
        </AuthProvider>
        <Footer />
      </body>
    </html>
  );
}
