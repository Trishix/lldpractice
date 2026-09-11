import type { Metadata } from "next";
import { listPublicProblems } from "@/server/content";
import { PracticeProvider } from "@/ui/provider";
import "./globals.css";
export const metadata: Metadata = { title: { default: "LLD Practice", template: "%s | LLD Practice" }, description: "Low-level design practice with frozen submissions, evidence-backed feedback, and local history." };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  const problems = listPublicProblems();
  return <html lang="en"><body><PracticeProvider problems={problems}>{children}</PracticeProvider></body></html>;
}
