import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./AuthProvider";
import { mutate, request } from "../lib/api";
import { okSchema, savedTagsSchema } from "../../shared/auth";

const KEY = "porcupine:saved-tags";

const SavedTagsContext = createContext<{
  ids: string[];
  toggle: (id: string) => void;
  storageError: boolean;
  busy: boolean;
} | null>(null);

export function SavedTagsProvider({ children }: { children: ReactNode }) {
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
  const [migrationError, setMigrationError] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const migrationUser = useRef<string | null>(null);
  const userId = user?.id;
  const queryKey = useMemo(() => ["private", "saved-tags", userId], [userId]);
  const result = useQuery({
    queryKey,
    queryFn: () => request("/account/saved-tags", savedTagsSchema),
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

  // When an anonymous visitor signs in, merge their local choices into the
  // account one tag at a time. The preference list is intentionally small and
  // this keeps the API contract simple while preserving every choice.
  useEffect(() => {
    if (!userId) {
      migrationUser.current = null;
      void Promise.resolve().then(() => setMigrating(false));
      return;
    }
    if (result.isPending || result.error || migrationUser.current === userId)
      return;
    const serverIds = new Set(result.data?.ids ?? []);
    const pending = localIds.filter((id) => !serverIds.has(id));
    migrationUser.current = userId;
    void (async () => {
      await Promise.resolve();
      if (migrationUser.current !== userId) return;
      setMigrationError(false);
      if (!pending.length) {
        if (localIds.length) persist([]);
        setMigrating(false);
        return;
      }
      setMigrating(true);
      try {
        await Promise.all(
          pending.map((id) =>
            mutate(`/account/saved-tags/${id}`, okSchema, {}, "PUT"),
          ),
        );
        if (migrationUser.current !== userId) return;
        persist([]);
        await client.invalidateQueries({ queryKey });
      } catch {
        if (migrationUser.current !== userId) return;
        migrationUser.current = null;
        setMigrationError(true);
      } finally {
        if (migrationUser.current === userId) setMigrating(false);
      }
    })();
  }, [
    client,
    localIds,
    queryKey,
    result.data,
    result.error,
    result.isPending,
    userId,
  ]);

  const serverIds = result.data?.ids ?? [];
  const ids = user ? [...new Set([...serverIds, ...localIds])] : localIds;
  const busy =
    loading ||
    !!authError ||
    (!!user && (result.isPending || update.isPending || migrating));

  return (
    <SavedTagsContext.Provider
      value={{
        ids,
        busy,
        storageError: user
          ? !!result.error || !!update.error || migrationError
          : storageError,
        toggle: (id) => {
          if (busy) return;
          if (user)
            update.mutate({
              path: "/account/saved-tags/" + id,
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
    </SavedTagsContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSavedTags() {
  const value = useContext(SavedTagsContext);
  if (!value) throw new Error("SavedTagsProvider missing");
  return value;
}
