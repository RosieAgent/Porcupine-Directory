import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Button,
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
import KeyOutlined from "@mui/icons-material/KeyOutlined";
import { z } from "zod";
import { mutate, request } from "../lib/api";
import { useAuth } from "../state/AuthProvider";
import { ErrorState, Loading } from "./Page";

const environmentSchema = z.enum(["development", "staging", "production"]);
const serviceAccountSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  environment: environmentSchema,
  scopes: z.array(z.string()),
  tokenPrefix: z.string(),
  expiresAt: z.string(),
  revokedAt: z.string().nullable(),
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

function date(value: string | null) {
  return value ? new Date(value).toLocaleString() : "Never";
}

function status(account: z.infer<typeof serviceAccountSchema>) {
  if (account.revokedAt) return "Revoked";
  if (new Date(account.expiresAt).getTime() <= Date.now()) return "Expired";
  return "Active";
}

export function AdminServiceAccounts() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [expiresInDays, setExpiresInDays] = useState("90");
  const [reason, setReason] = useState("");
  const [purpose, setPurpose] = useState("");
  const [created, setCreated] = useState<
    z.infer<typeof createServiceAccountResponse> | undefined
  >();
  const [copied, setCopied] = useState(false);
  const accounts = useQuery({
    queryKey: ["private", "admin-service-accounts", user?.id],
    queryFn: () => request("/admin/service-accounts", serviceAccountsResponse),
    enabled: !!user?.staffVerified,
  });
  const create = useMutation({
    mutationFn: () =>
      mutate("/admin/service-accounts", createServiceAccountResponse, {
        name: name.trim(),
        expiresInDays: Number(expiresInDays),
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
  const days = Number(expiresInDays);
  const canCreate =
    name.trim().length >= 3 &&
    reason.trim().length >= 3 &&
    Number.isInteger(days) &&
    days >= 1 &&
    days <= 365;
  if (!user?.staffVerified) return null;
  return (
    <Paper variant="outlined" sx={{ p: 3 }}>
      <Stack spacing={2}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <KeyOutlined />
          <Typography variant="h2">Service accounts</Typography>
        </Stack>
        <Typography>
          Create a listing-only PAT for trusted automation or an AI agent. It is
          bound to this environment, expires automatically, and is shown only
          once.
        </Typography>
        <Alert severity="info">
          Permissions are fixed for v1: <strong>listings:read</strong> and{" "}
          <strong>listings:write</strong>. Service accounts cannot delete,
          publish, manage users, change ownership, or access the database.
        </Alert>
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
          >
            Create PAT
          </Button>
        </Stack>
        {create.error && <Alert severity="error">{create.error.message}</Alert>}
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
              <Stack direction="row" spacing={1}>
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
        {accounts.isPending ? (
          <Loading />
        ) : accounts.error ? (
          <ErrorState
            error={accounts.error}
            retry={() => void accounts.refetch()}
          />
        ) : (
          <Stack spacing={1}>
            <Typography variant="h3">
              {accounts.data.environment} service accounts
            </Typography>
            {!accounts.data.items.length ? (
              <Alert severity="info">No service accounts created yet.</Alert>
            ) : (
              <TableContainer>
                <Table size="small" aria-label="Service accounts">
                  <TableHead>
                    <TableRow>
                      <TableCell>Name</TableCell>
                      <TableCell>Token</TableCell>
                      <TableCell>Scopes</TableCell>
                      <TableCell>Expires</TableCell>
                      <TableCell>Last used</TableCell>
                      <TableCell>Status</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {accounts.data.items.map((account) => (
                      <TableRow key={account.id}>
                        <TableCell>{account.name}</TableCell>
                        <TableCell>{account.tokenPrefix}…</TableCell>
                        <TableCell>{account.scopes.join(", ")}</TableCell>
                        <TableCell>{date(account.expiresAt)}</TableCell>
                        <TableCell>{date(account.lastUsedAt)}</TableCell>
                        <TableCell>{status(account)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}
