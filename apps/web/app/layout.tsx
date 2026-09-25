import type { Metadata } from "next";
import { Suspense } from "react";
import { Nav } from "@/components/nav";
import { listProjects } from "@/lib/queries";
import "./globals.css";

export const metadata: Metadata = { title: "AI QA" };
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const projects = listProjects().map((p) => ({ id: p.id, name: p.name }));
  return (
    <html lang="en">
      <body className="min-h-screen">
        <Suspense>
          <Nav projects={projects} current={projects[0]?.id} />
        </Suspense>
        <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
      </body>
    </html>
  );
}
