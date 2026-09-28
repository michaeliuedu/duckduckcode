import type { Metadata } from "next";
import "./globals.css";
import { ConfigProvider } from "@/components/ConfigProvider";

export const metadata: Metadata = {
  title: "duckduckcode — office hours workspace",
  description: "A shared coding workspace for students and TAs during office hours.",
};

// Read at request time so the same image works locally and on AWS.
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const backendUrl = process.env.BACKEND_PUBLIC_URL ?? "";
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-zinc-950 text-zinc-100">
        <ConfigProvider backendUrl={backendUrl}>{children}</ConfigProvider>
      </body>
    </html>
  );
}
