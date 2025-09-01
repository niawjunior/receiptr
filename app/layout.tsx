import type { Metadata } from "next";
import { Prompt } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const prompt = Prompt({
  variable: "--font-prompt",
  weight: ["400", "500", "600", "700", "800", "900"],
  subsets: ["thai"],
});

export const metadata: Metadata = {
  title: "Sliptr",
  description:
    "Upload your receipt image and let AI extract, classify, and organize the information for you.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${prompt.variable} antialiased`}>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
