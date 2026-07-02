// web/app/layout.jsx
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { UnsavedChangesProvider } from "@/contexts/UnsavedChangesContext";

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  title: "Order Tracking System - Stealth Machine Tools",
  description: "Manufacturing order tracking and management system",
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={inter.className} style={{ margin: 0, padding: 0 }}>
        <AuthProvider>
          <UnsavedChangesProvider>
            {children}
          </UnsavedChangesProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
