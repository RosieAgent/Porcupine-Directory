import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { sessionSchema, okSchema } from "../../shared/auth";
import type { Account } from "../../shared/auth";
import { request, mutate } from "../lib/api";
const AuthContext = createContext<{
  user: Account | null;
  loading: boolean;
  emailRecoveryEnabled: boolean;
  passkeysEnabled: boolean;
  staffAuthMode: "passkey" | "password_recent" | "session";
  emailPreviewEnabled: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
} | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const result = useQuery({
    queryKey: ["session"],
    queryFn: () => request("/auth/session", sessionSchema),
    refetchOnWindowFocus: true,
    refetchInterval: 60000,
  });
  const refresh = async () => {
    const session = await request("/auth/session", sessionSchema);
    client.setQueryData(["session"], session);
    client.removeQueries({
      predicate: (query) => query.queryKey[0] === "private",
    });
    await client.invalidateQueries({
      predicate: (query) => query.queryKey[0] !== "session",
    });
  };
  return (
    <AuthContext.Provider
      value={{
        user: result.data?.user ?? null,
        loading: result.isPending,
        emailRecoveryEnabled: result.data?.emailRecoveryEnabled ?? false,
        passkeysEnabled: result.data?.passkeysEnabled ?? false,
        staffAuthMode: result.data?.staffAuthMode ?? "passkey",
        emailPreviewEnabled: result.data?.emailPreviewEnabled ?? false,
        error: result.error,
        refresh,
        logout: async () => {
          await mutate("/auth/logout", okSchema);
          await refresh();
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("AuthProvider missing");
  return context;
}
