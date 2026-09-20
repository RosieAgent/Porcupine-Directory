import { useQuery } from "@tanstack/react-query";
import {
  Pagination,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import EditOutlined from "@mui/icons-material/EditOutlined";
import DeleteOutlineOutlined from "@mui/icons-material/DeleteOutlineOutlined";
import SupervisorAccountOutlined from "@mui/icons-material/SupervisorAccountOutlined";
import { useState } from "react";
import { z } from "zod";
import { useAuth } from "../state/AuthProvider";
import { request } from "../lib/api";
import { Loading, ErrorState } from "./Page";
import { IconAction } from "./IconAction";

const adminUserSchema = z.object({
  id: z.uuid(),
  username: z.string(),
  role: z.enum(["user", "editor", "administrator"]),
  privilegesSuspended: z.boolean(),
  recoverySaved: z.boolean(),
  setupPending: z.boolean(),
});

export type AdminUser = z.infer<typeof adminUserSchema>;

const usersResponse = z.object({
  items: z.array(adminUserSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
});

function roleLabel(role: AdminUser["role"]) {
  return role === "editor" ? "monitor" : role;
}

export function AdminUsers({
  selectedId,
  onEdit,
  onDelete,
  onToggleMonitor,
}: {
  selectedId?: string;
  onEdit: (account: AdminUser) => void;
  onDelete: (account: AdminUser) => void;
  onToggleMonitor: (account: AdminUser) => void;
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
          Search private accounts and use the actions column to edit, delete, or
          grant global monitor access. Administrators remain host-managed.
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
            <TableContainer>
              <Table size="small" aria-label="User accounts">
                <TableHead>
                  <TableRow>
                    <TableCell>Username</TableCell>
                    <TableCell>Access</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {result.data.items.map((account) => {
                    const ownAccount = account.id === user.id;
                    const administrator = account.role === "administrator";
                    const canEdit = !ownAccount && !administrator;
                    const canDelete = canEdit;
                    const canMakeMonitor =
                      !ownAccount &&
                      !administrator &&
                      (account.role === "editor" ||
                        (account.recoverySaved && !account.setupPending));
                    return (
                      <TableRow
                        key={account.id}
                        hover
                        selected={account.id === selectedId}
                        tabIndex={0}
                        onClick={() => onEdit(account)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            onEdit(account);
                          }
                        }}
                        sx={{ cursor: "pointer" }}
                      >
                        <TableCell component="th" scope="row">
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {account.username}
                          </Typography>
                        </TableCell>
                        <TableCell>{roleLabel(account.role)}</TableCell>
                        <TableCell>
                          {[
                            account.setupPending && "setup pending",
                            account.privilegesSuspended &&
                              "privileges suspended",
                            !account.recoverySaved && "recovery not saved",
                          ]
                            .filter(Boolean)
                            .join(" · ") || "ready"}
                        </TableCell>
                        <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                          <IconAction
                            label={`Edit account: ${account.username}`}
                            disabled={!canEdit}
                            onClick={(event) => {
                              event.stopPropagation();
                              onEdit(account);
                            }}
                          >
                            <EditOutlined />
                          </IconAction>
                          <IconAction
                            label={`Delete account: ${account.username}`}
                            disabled={!canDelete}
                            onClick={(event) => {
                              event.stopPropagation();
                              onDelete(account);
                            }}
                          >
                            <DeleteOutlineOutlined />
                          </IconAction>
                          <IconAction
                            label={
                              account.role === "editor"
                                ? `Remove monitor access: ${account.username}`
                                : `Make monitor: ${account.username}`
                            }
                            disabled={!canMakeMonitor}
                            onClick={(event) => {
                              event.stopPropagation();
                              onToggleMonitor(account);
                            }}
                          >
                            <SupervisorAccountOutlined />
                          </IconAction>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
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
