import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControlLabel,
  FormGroup,
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
import ContentCopyOutlined from "@mui/icons-material/ContentCopyOutlined";
import DeleteOutlineOutlined from "@mui/icons-material/DeleteOutlineOutlined";
import KeyOutlined from "@mui/icons-material/KeyOutlined";
import { z } from "zod";
import { okSchema } from "../../shared/auth";
import { mutate, request } from "../lib/api";
import { useAuth } from "../state/AuthProvider";
import { ErrorState, Loading } from "./Page";

const environmentSchema = z.enum(["development", "staging", "production"]);
const serviceScopes = [
  "listings:read",
  "listings:create",
  "listings:edit",
] as const;
const serviceAccountSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  environment: environmentSchema,
  scopes: z.array(z.string()),
  tokenPrefix: z.string(),
  expiresAt: z.string(),
  revokedAt: z.string().nullable(),
  deletedAt: z.string().nullable(),
  createdAt: z.string(),
  lastUsedAt: z.string().nullable(),
});
const serviceAccountsResponse = z.object({
  environment: environmentSchema,
  items: z.array(serviceAccountSchema),
});
const createServiceAccountResponse = z.object({
  token: z.string().regex(/^pd_pat_/),
  serviceAccount: serviceAccountSchema,
});
type ServiceAccount = z.infer<typeof serviceAccountSchema>;

function date(value: string | null) {
  return value ? new Date(value).toLocaleString() : "Never";
}

function status(account: ServiceAccount) {
  if (account.deletedAt) return "Deleted";
  if (account.revokedAt) return "Revoked";
  if (new Date(account.expiresAt).getTime() <= Date.now()) return "Expired";
  return "Active";
}

function statusColor(account: ServiceAccount) {
  if (account.deletedAt || account.revokedAt) return "default" as const;
  return new Date(account.expiresAt).getTime() <= Date.now()
    ? ("warning" as const)
    : ("success" as const);
}

export function AdminServiceAccounts() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [expiresInDays, setExpiresInDays] = useState("90");
  const [reason, setReason] = useState("");
  const [purpose, setPurpose] = useState("");
  const [scopes, setScopes] = useState<string[]>([
    "listings:read",
    "listings:edit",
  ]);
  const [created, setCreated] = useState<
    z.infer<typeof createServiceAccountResponse> | undefined
  >();
  const [copied, setCopied] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ServiceAccount | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const accounts = useQuery({
    queryKey: ["private", "admin-service-accounts", user?.id, showDeleted],
    queryFn: () =>
      request(
        `/admin/service-accounts?includeDeleted=${showDeleted}`,
        serviceAccountsResponse,
      ),
    enabled: !!user?.staffVerified,
  });
  const create = useMutation({
    mutationFn: () =>
      mutate("/admin/service-accounts", createServiceAccountResponse, {
        name: name.trim(),
        expiresInDays: Number(expiresInDays),
        scopes,
        reason: reason.trim(),
        ...(purpose.trim() ? { context: { purpose: purpose.trim() } } : {}),
      }),
    onSuccess: async (result) => {
      setCreated(result);
      setCopied(false);
      setName("");
      setReason("");
      setPurpose("");
      await queryClient.invalidateQueries({
        queryKey: ["private", "admin-service-accounts"],
      });
    },
  });
  const remove = useMutation({
    mutationFn: () => {
      if (!deleteTarget) throw new Error("Choose a service account first.");
      return mutate(
        `/admin/service-accounts/${deleteTarget.id}`,
        okSchema,
        { reason: deleteReason.trim() },
        "DELETE",
      );
    },
    onSuccess: async () => {
      setDeleteTarget(null);
      setDeleteReason("");
      await queryClient.invalidateQueries({
        queryKey: ["private", "admin-service-accounts"],
      });
    },
  });
  const days = Number(expiresInDays);
  const canCreate =
    name.trim().length >= 3 &&
    scopes.length > 0 &&
    reason.trim().length >= 3 &&
    Number.isInteger(days) &&
    days >= 1 &&
    days <= 365;
  const canDelete = !!deleteTarget && deleteReason.trim().length >= 3;
  if (!user?.staffVerified) return null;
  return (
    <>
      <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
        <Stack spacing={2.5}>
          <Stack spacing={1.5}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
              <KeyOutlined />
              <Typography variant="h2">Issue a service token</Typography>
            </Stack>
            <Typography color="text.secondary" sx={{ maxWidth: 760 }}>
              Create a listing-only PAT for trusted automation or an AI agent.
              It is bound to this environment, expires automatically, and is
              shown only once.
            </Typography>
            <Alert severity="info">
              Creating a listing can make new public content immediately,
              depending on the site submission policy. Grant only the scopes the
              agent needs. Service accounts cannot delete listings, publish or
              archive them, manage users, change ownership, or access the
              database.
            </Alert>
          </Stack>
          <Stack
            component="form"
            spacing={2}
            onSubmit={(event) => {
              event.preventDefault();
              if (canCreate) create.mutate();
            }}
            sx={{ maxWidth: 650 }}
          >
            <TextField
              label="Service account name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              helperText="3–80 lowercase letters, numbers, dots, dashes, or underscores."
              slotProps={{ htmlInput: { maxLength: 80, spellCheck: false } }}
              required
            />
            <TextField
              label="Token lifetime (days)"
              type="number"
              value={expiresInDays}
              onChange={(event) => setExpiresInDays(event.target.value)}
              slotProps={{ htmlInput: { min: 1, max: 365 } }}
              helperText="Between 1 and 365 days; 90 days is the default."
              required
            />
            <FormGroup>
              {serviceScopes.map((scope) => (
                <FormControlLabel
                  key={scope}
                  control={
                    <Checkbox
                      checked={scopes.includes(scope)}
                      onChange={(event) =>
                        setScopes((current) =>
                          event.target.checked
                            ? [...current, scope]
                            : current.filter((value) => value !== scope),
                        )
                      }
                    />
                  }
                  label={
                    scope === "listings:read"
                      ? "Read published listings"
                      : scope === "listings:create"
                        ? "Create listings"
                        : "Edit listings and images"
                  }
                />
              ))}
            </FormGroup>
            <Typography variant="body2" color="text.secondary">
              Existing <strong>listings:write</strong> tokens keep their editing
              access; they do not gain create permission.
            </Typography>
            <TextField
              label="Reason for creating this token"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              helperText="This is recorded in the administrator audit log."
              slotProps={{ htmlInput: { maxLength: 500 } }}
              required
            />
            <TextField
              label="Purpose or notes (optional)"
              value={purpose}
              onChange={(event) => setPurpose(event.target.value)}
              slotProps={{ htmlInput: { maxLength: 500 } }}
            />
            <Button
              type="submit"
              variant="contained"
              startIcon={<KeyOutlined />}
              disabled={!canCreate || create.isPending}
              sx={{ alignSelf: "flex-start" }}
            >
              Create PAT
            </Button>
          </Stack>
          {create.error && (
            <Alert severity="error">{create.error.message}</Alert>
          )}
          {created && (
            <Alert severity="warning">
              <Stack spacing={1} sx={{ width: "100%" }}>
                <Typography sx={{ fontWeight: 600 }}>
                  Copy this PAT to Proton Pass now. It will not be shown again.
                </Typography>
                <TextField
                  label="New PAT"
                  value={created.token}
                  fullWidth
                  slotProps={{
                    input: { readOnly: true },
                    htmlInput: { spellCheck: false },
                  }}
                />
                <Stack direction="row" spacing={1} useFlexGap>
                  <Button
                    startIcon={<ContentCopyOutlined />}
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(created.token);
                        setCopied(true);
                      } catch {
                        setCopied(false);
                      }
                    }}
                  >
                    {copied ? "Copied" : "Copy PAT"}
                  </Button>
                  <Button onClick={() => setCreated(undefined)}>
                    Clear secret
                  </Button>
                </Stack>
              </Stack>
            </Alert>
          )}
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
        <Stack spacing={2}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1}
            useFlexGap
            sx={{
              alignItems: { sm: "center" },
              justifyContent: "space-between",
            }}
          >
            <Box>
              <Typography variant="h2">Service account inventory</Typography>
              {accounts.data && (
                <Typography variant="body2" color="text.secondary">
                  {accounts.data.environment} environment
                  {accounts.data.items.length
                    ? ` · ${accounts.data.items.length} account${accounts.data.items.length === 1 ? "" : "s"} shown`
                    : ""}
                </Typography>
              )}
            </Box>
            <FormControlLabel
              control={
                <Checkbox
                  checked={showDeleted}
                  onChange={(event) => setShowDeleted(event.target.checked)}
                />
              }
              label="Include deleted"
              sx={{ mr: 0 }}
            />
          </Stack>
          <Typography variant="body2" color="text.secondary">
            Deleting an account immediately revokes its PAT and hides it from
            the default list. Its record remains available here and in the audit
            history.
          </Typography>
          {accounts.isPending ? (
            <Loading />
          ) : accounts.error ? (
            <ErrorState
              error={accounts.error}
              retry={() => void accounts.refetch()}
            />
          ) : !accounts.data.items.length ? (
            <Alert severity="info">
              {showDeleted
                ? "No service accounts match this view yet."
                : "No current service accounts. Create a token above or include deleted accounts."}
            </Alert>
          ) : (
            <>
              <TableContainer sx={{ maxWidth: "100%" }}>
                <Table
                  size="small"
                  aria-label="Service accounts"
                  sx={{ minWidth: 980 }}
                >
                  <TableHead>
                    <TableRow>
                      <TableCell>Name</TableCell>
                      <TableCell>Actions</TableCell>
                      <TableCell>Token prefix</TableCell>
                      <TableCell>Scopes</TableCell>
                      <TableCell>Created</TableCell>
                      <TableCell>Expires</TableCell>
                      <TableCell>Last used</TableCell>
                      <TableCell>Status</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {accounts.data.items.map((account) => (
                      <TableRow key={account.id}>
                        <TableCell component="th" scope="row">
                          <Typography sx={{ fontWeight: 600 }}>
                            {account.name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {account.environment}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ whiteSpace: "nowrap" }}>
                          {account.deletedAt ? (
                            <Typography variant="body2" color="text.secondary">
                              —
                            </Typography>
                          ) : (
                            <Button
                              size="small"
                              color="error"
                              startIcon={<DeleteOutlineOutlined />}
                              disabled={remove.isPending}
                              onClick={() => {
                                remove.reset();
                                setDeleteReason("");
                                setDeleteTarget(account);
                              }}
                            >
                              Delete
                            </Button>
                          )}
                        </TableCell>
                        <TableCell sx={{ whiteSpace: "nowrap" }}>
                          {account.tokenPrefix}…
                        </TableCell>
                        <TableCell
                          sx={{ maxWidth: 260, overflowWrap: "anywhere" }}
                        >
                          {account.scopes
                            .map((scope) =>
                              scope === "listings:write"
                                ? "listings:edit (legacy listings:write)"
                                : scope,
                            )
                            .join(", ")}
                        </TableCell>
                        <TableCell>{date(account.createdAt)}</TableCell>
                        <TableCell>{date(account.expiresAt)}</TableCell>
                        <TableCell>{date(account.lastUsedAt)}</TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            label={status(account)}
                            color={statusColor(account)}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              {remove.error && !deleteTarget && (
                <Alert severity="error">{remove.error.message}</Alert>
              )}
            </>
          )}
        </Stack>
      </Paper>

      <Dialog
        open={!!deleteTarget}
        onClose={() => {
          if (!remove.isPending) setDeleteTarget(null);
        }}
        aria-labelledby="delete-service-title"
        aria-describedby="delete-service-description"
        role="alertdialog"
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle id="delete-service-title">
          Delete {deleteTarget?.name}?
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            <DialogContentText id="delete-service-description">
              This immediately revokes the PAT for the{" "}
              {deleteTarget?.environment} environment and removes the account
              from the current list. Any agent using it will stop working. The
              account record and audit history are retained; choose “Include
              deleted” to inspect it.
            </DialogContentText>
            <TextField
              label="Reason for deleting this service account"
              value={deleteReason}
              onChange={(event) => setDeleteReason(event.target.value)}
              helperText="Required and recorded in the administrator audit log."
              slotProps={{ htmlInput: { maxLength: 500 } }}
              multiline
              minRows={2}
              autoFocus
              required
            />
            {remove.error && (
              <Alert severity="error">{remove.error.message}</Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => setDeleteTarget(null)}
            disabled={remove.isPending}
          >
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            startIcon={<DeleteOutlineOutlined />}
            disabled={!canDelete || remove.isPending}
            onClick={() => remove.mutate()}
          >
            Delete service account
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
