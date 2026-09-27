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
  toggle: (id: string) => Promise<boolean>;
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
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
      setLocalIds(next);
      setStorageError(false);
      return true;
    } catch {
      setStorageError(true);
      return false;
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
        toggle: async (id) => {
          if (busy) throw new Error("Bookmarks are still loading.");
          const nextSaved = !ids.includes(id);
          if (user) {
            await update.mutateAsync({
              path: "/account/saved/" + id,
              method: nextSaved ? "PUT" : "DELETE",
            });
          } else if (
            !persist(
              nextSaved
                ? [...ids, id].slice(-1000)
                : ids.filter((value) => value !== id),
            )
          ) {
            throw new Error(
              "This browser could not save the bookmark. Please check storage permissions and try again.",
            );
          }
          return nextSaved;
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
