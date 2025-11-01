import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DeadlineDAO - AI-Powered Accountability",
  description: "Lock SOL to your deadline. AI validates your proof. Complete it? Get paid. Fail? Your money goes to winners.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
