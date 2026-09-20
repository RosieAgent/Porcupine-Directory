import { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./AuthProvider";
import { request, mutate } from "../lib/api";
import { savedSchema, okSchema } from "../../shared/auth";
const KEY = "porcupine:saved";
const SavedContext = createContext<{
  ids: string[];
  toggle: (id: string) => void;
  clear: () => void;
  storageError: boolean;
  busy: boolean;
} | null>(null);
export function SavedProvider({ children }: { children: ReactNode }) {
  const { user, loading, error: authError } = useAuth();
  const client = useQueryClient();
  const [localIds, setLocalIds] = useState<string[]>(() => {
    try {
      return [
        ...new Set(
          z
            .array(z.uuid())
            .max(1000)
            .parse(JSON.parse(localStorage.getItem(KEY) ?? "[]")),
        ),
      ];
    } catch {
      return [];
    }
  });
  const [storageError, setStorageError] = useState(false);
  const queryKey = ["private", "saved", user?.id];
  const result = useQuery({
    queryKey,
    queryFn: () => request("/account/saved", savedSchema),
    enabled: !!user,
    refetchOnWindowFocus: true,
  });
  const update = useMutation({
    mutationFn: ({ path, method }: { path: string; method: string }) =>
      mutate(path, okSchema, {}, method),
    onSuccess: () => client.invalidateQueries({ queryKey }),
  });
  const persist = (next: string[]) => {
    setLocalIds(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  };
  const ids = user ? (result.data?.ids ?? []) : localIds;
  const busy =
    loading ||
    !!authError ||
    (!!user && (result.isPending || update.isPending));
  return (
    <SavedContext.Provider
      value={{
        ids,
        busy,
        storageError: user ? !!result.error || !!update.error : storageError,
        clear: () => {
          if (busy) return;
          if (user) update.mutate({ path: "/account/saved", method: "DELETE" });
          else persist([]);
        },
        toggle: (id) => {
          if (busy) return;
          if (user)
            update.mutate({
              path: "/account/saved/" + id,
              method: ids.includes(id) ? "DELETE" : "PUT",
            });
          else
            persist(
              ids.includes(id)
                ? ids.filter((value) => value !== id)
                : [...ids, id].slice(-1000),
            );
        },
      }}
    >
      {children}
    </SavedContext.Provider>
  );
}
// eslint-disable-next-line react-refresh/only-export-components
export function useSaved() {
  const value = useContext(SavedContext);
  if (!value) throw new Error("SavedProvider missing");
  return value;
}
