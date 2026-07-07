import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { MobileNav } from "./MobileNav";
import { CommandPalette } from "@/components/search/CommandPalette";
import { ZonoCommandCenter } from "@/components/navigation/zono-command-center";
import { ZIWidget } from "@/components/zi-expert/ZIWidget";
import { PageTransition } from "./PageTransition";

/**
 * App frame: RTL slim sidebar (right/start side) + header + scrolling main +
 * mobile bottom nav. Content is constrained to a comfortable max width.
 */
export function DashboardShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <main className="flex-1 px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-12">
          <div className="mx-auto w-full max-w-[1600px]">
            <PageTransition>{children}</PageTransition>
          </div>
        </main>
      </div>
      <MobileNav />
      <CommandPalette />
      <ZonoCommandCenter />
      <ZIWidget />
    </div>
  );
}
