import { useQuery } from "@tanstack/react-query";
import {
  List,
  ListItemButton,
  ListItemText,
  Pagination,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useState } from "react";
import { z } from "zod";
import { useAuth } from "../state/AuthProvider";
import { request } from "../lib/api";
import { Loading, ErrorState } from "./Page";
const usersResponse = z.object({
  items: z.array(
    z.object({
      id: z.uuid(),
      username: z.string(),
      role: z.enum(["user", "editor", "administrator"]),
      privilegesSuspended: z.boolean(),
      recoverySaved: z.boolean(),
      setupPending: z.boolean(),
    }),
  ),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
});
export function AdminUsers({
  onSelect,
}: {
  onSelect: (username: string) => void;
}) {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const result = useQuery({
    queryKey: ["private", "admin-users", user?.id, search, page],
    queryFn: ({ signal }) =>
      request(
        `/admin/users?q=${encodeURIComponent(search)}&page=${page}`,
        usersResponse,
        { signal },
      ),
    enabled:
      user?.role === "administrator" &&
      user.staffVerified &&
      user.recoverySaved &&
      !user.privilegesSuspended,
  });
  if (!user?.staffVerified || !user.recoverySaved || user.privilegesSuspended)
    return null;
  return (
    <Paper variant="outlined" sx={{ p: 3 }}>
      <Stack spacing={2}>
        <Typography variant="h2">Users</Typography>
        <Typography variant="body2">
          Administrator-only account management. Select an account, then use
          Find account below to manage its editor role.
        </Typography>
        <TextField
          label="Search usernames"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          slotProps={{ htmlInput: { maxLength: 80 } }}
        />
        {result.isPending ? (
          <Loading />
        ) : result.error ? (
          <ErrorState
            error={result.error}
            retry={() => void result.refetch()}
          />
        ) : (
          <>
            <Typography>{result.data.total} accounts</Typography>
            <List disablePadding>
              {result.data.items.map((account) => (
                <ListItemButton
                  key={account.id}
                  onClick={() => onSelect(account.username)}
                >
                  <ListItemText
                    primary={account.username}
                    secondary={`${account.role}${account.setupPending ? " · setup pending" : ""}${account.privilegesSuspended ? " · privileges suspended" : ""}${!account.recoverySaved ? " · recovery phrase not saved" : ""}`}
                  />
                </ListItemButton>
              ))}
            </List>
            <Pagination
              page={page}
              count={Math.max(
                1,
                Math.ceil(result.data.total / result.data.pageSize),
              )}
              onChange={(_, value) => setPage(value)}
            />
          </>
        )}
      </Stack>
    </Paper>
  );
}
