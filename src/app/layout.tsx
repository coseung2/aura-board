import type { Metadata } from "next";
import Script from "next/script";
import { AppBackgroundLayer } from "@/components/AppBackground";
import { AuthProvider } from "@/components/AuthProvider";
import { DJPlayerProvider } from "@/components/dj/DJPlayerProvider";
import { Footer } from "@/components/Footer";
import { GlobalToolkitFab } from "@/components/GlobalToolkitFab";
import { TwemojiRoot } from "@/components/TwemojiRoot";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aura-board",
  description: "Classroom workspace",
  metadataBase: new URL("https://aura-board.com"),
  icons: {
    icon: "/aura-app-icon-512.png",
    apple: "/aura-app-icon-512.png",
  },
  openGraph: {
    title: "Aura-board",
    description: "Classroom workspace",
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
        <noscript>
          <iframe
            src="https://www.googletagmanager.com/ns.html?id=GTM-KKNWDX8N"
            height="0"
            width="0"
            style={{ display: "none", visibility: "hidden" }}
          />
        </noscript>
        <Script id="google-tag-manager" strategy="afterInteractive">
          {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-KKNWDX8N');`}
        </Script>
        <AppBackgroundLayer />
        <TwemojiRoot />
        <AuthProvider>
          <DJPlayerProvider>
            {children}
            <GlobalToolkitFab />
          </DJPlayerProvider>
        </AuthProvider>
        <Footer />
      </body>
    </html>
  );
}
