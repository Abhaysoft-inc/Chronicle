import type { Metadata } from "next";
import { Geist_Mono, Hanken_Grotesk, Newsreader } from "next/font/google";
import { ToastProvider } from "@/components/ui/toast";
import { AuthProvider } from "@/features/auth/auth-context";
import "./globals.css";

// Sarvam's site pairs Matter (body) with Season Mix (display serif). Both are paid typefaces, so these are
// free stand-ins with the same character: Hanken Grotesk for the neo-grotesque body, Newsreader for the serif headings.
const sans = Hanken_Grotesk({
  variable: "--font-body-src",
  subsets: ["latin"],
});

const display = Newsreader({
  variable: "--font-display-src",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Chronicle: medical record review",
  description: "Turn handwritten, multi-language medical records into a sourced timeline an expert can trust.",
};

// Fonts and the toast provider only. The two route groups add their own chrome:
// (marketing) = landing page header/footer, (app) = the workspace header.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${sans.variable} ${display.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <ToastProvider>
          <AuthProvider>{children}</AuthProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
