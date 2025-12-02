import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Books Made Easy - Simple Accounting Software",
  description: "Professional accounting software for small businesses. Manage invoices, bills, customers, and vendors with ease.",
  keywords: "accounting software, invoicing, small business, bookkeeping, AR, AP",
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
