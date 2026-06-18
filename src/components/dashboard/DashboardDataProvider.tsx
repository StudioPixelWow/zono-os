"use client";

import { createContext, useContext, type ReactNode } from "react";
import type {
  DashboardContextData,
  DashboardOrganization,
  DashboardUser,
} from "@/lib/dashboard/types";

const CurrentUserContext = createContext<DashboardUser | null>(null);
const CurrentOrganizationContext = createContext<DashboardOrganization | null>(null);
const DashboardDataContext = createContext<DashboardContextData | null>(null);

/**
 * Provides the signed-in user's real dashboard context to client components.
 * The value is fetched on the server and passed down once.
 */
export function DashboardDataProvider({
  value,
  children,
}: {
  value: DashboardContextData;
  children: ReactNode;
}) {
  return (
    <DashboardDataContext.Provider value={value}>
      <CurrentUserContext.Provider value={value.user}>
        <CurrentOrganizationContext.Provider value={value.organization}>
          {children}
        </CurrentOrganizationContext.Provider>
      </CurrentUserContext.Provider>
    </DashboardDataContext.Provider>
  );
}

/** The signed-in user (null if unavailable). */
export const useCurrentUser = () => useContext(CurrentUserContext);
/** The signed-in user's organization (null if unavailable). */
export const useCurrentOrganization = () => useContext(CurrentOrganizationContext);
/** Full dashboard context (localities, counts, error flag). */
export function useDashboardData(): DashboardContextData {
  const ctx = useContext(DashboardDataContext);
  if (!ctx) {
    throw new Error("useDashboardData must be used within DashboardDataProvider");
  }
  return ctx;
}
