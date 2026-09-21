import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Pagination,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import ExpandMore from "@mui/icons-material/ExpandMore";
import RestoreOutlined from "@mui/icons-material/RestoreOutlined";
import { z } from "zod";
import { okSchema } from "../../shared/auth";
import { mutate, request } from "../lib/api";
import { useAuth } from "../state/AuthProvider";
import { ErrorState, Loading, Page } from "./Page";
import { StaffVerification } from "./StaffVerification";

const jsonObject = z.record(z.string(), z.unknown());
const listingAuditSchema = z.object({
  listingId: z.uuid(),
  name: z.string(),
  version: z.number(),
  action: z.string(),
  reason: z.string(),
  details: jsonObject,
  actorId: z.string().nullable(),
  actorType: z.enum(["account", "service_account", "system"]),
  requestId: z.string().nullable(),
  before: jsonObject.nullable(),
  after: jsonObject,
  current: jsonObject,
  createdAt: z.string(),
  currentVersion: z.number(),
  actorName: z.string().nullable(),
});
const listingAuditResponse = z.object({
  items: z.array(listingAuditSchema),
  page: z.number(),
  pageSize: z.number(),
});
const securityAuditSchema = z.object({
  id: z.string(),
  actorId: z.string().nullable(),
  actorType: z.enum(["account", "service_account", "system"]),
  subjectId: z.string().nullable(),
  subjectType: z.string(),
  action: z.string(),
  requestId: z.string().nullable(),
  reason: z.string(),
  details: jsonObject,
  outcome: z.string(),
  createdAt: z.string(),
  actorName: z.string().nullable(),
});
const securityAuditResponse = z.object({
  items: z.array(securityAuditSchema),
  page: z.number(),
});

const displayFields = [
  "name",
  "summary",
  "description",
  "url",
  "contact_url",
  "location",
  "tags",
  "access_mode",
  "access_instructions",
  "connections",
  "links",
  "lifecycle",
  "seeking_organizer",
  "public_phone",
  "public_email",
  "public_address",
  "opening_hours",
  "reference_sources",
];
function changedFields(
  current: Record<string, unknown>,
  target: Record<string, unknown>,
) {
  return displayFields.filter(
    (field) => JSON.stringify(current[field]) !== JSON.stringify(target[field]),
  );
}
function value(value: unknown) {
  if (value === undefined) return "—";
  return JSON.stringify(value);
}
function actorLabel(item: { actorType: string; actorName: string | null }) {
  return (
    item.actorName ?? (item.actorType === "system" ? "System" : item.actorType)
  );
}

export function AdminAudit() {
  const { user } = useAuth();
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const [target, setTarget] = useState<z.infer<
    typeof listingAuditSchema
  > | null>(null);
  const [reason, setReason] = useState("");
  const listings = useQuery({
    queryKey: ["private", "admin-listing-audit", user?.id, page],
    queryFn: () =>
      request(`/admin/audit/listings?page=${page}`, listingAuditResponse),
    enabled: !!user?.staffVerified,
  });
  const security = useQuery({
    queryKey: ["private", "admin-security-audit", user?.id],
    queryFn: () => request("/admin/audit?page=1", securityAuditResponse),
    enabled: !!user?.staffVerified,
  });
  const restore = useMutation({
    mutationFn: () => {
      if (!target) throw new Error("Choose a revision first.");
      return mutate(`/listings/${target.listingId}/restore`, okSchema, {
        version: target.currentVersion,
        targetVersion: target.version,
        reason,
      });
    },
    onSuccess: async () => {
      setTarget(null);
      setReason("");
      await client.invalidateQueries({ queryKey: ["private"] });
    },
  });
  const canRestore =
    !!target &&
    target.version < target.currentVersion &&
    reason.trim().length >= 3;
  return (
    <Page
      title="Audit log"
      parent={{ label: "Administration", to: "/admin" }}
      account
      description="Review listing changes, service-account activity and restore an earlier listing revision as a new revision."
    >
      <StaffVerification />
      {!user?.staffVerified && (
        <Alert severity="info">
          Verify your staff session on the Administration page to view the audit
          log.
        </Alert>
      )}
      {listings.isPending ? (
        <Loading />
      ) : listings.error ? (
        <ErrorState
          error={listings.error}
          retry={() => void listings.refetch()}
        />
      ) : (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Stack spacing={2}>
            <Typography variant="h2">Listing changes</Typography>
            {listings.data.items.map((item) => (
              <Accordion key={`${item.listingId}-${item.version}`}>
                <AccordionSummary expandIcon={<ExpandMore />}>
                  <Stack sx={{ minWidth: 0 }}>
                    <Typography>
                      {item.name} · revision {item.version} · {item.action}
                    </Typography>
                    <Typography variant="caption">
                      {new Date(item.createdAt).toLocaleString()} ·{" "}
                      {actorLabel(item)} · current revision{" "}
                      {item.currentVersion}
                    </Typography>
                  </Stack>
                </AccordionSummary>
                <AccordionDetails>
                  <Stack spacing={1}>
                    <Typography variant="body2">
                      Reason: {item.reason || "Not supplied"}
                    </Typography>
                    <Typography variant="body2">
                      Changed:{" "}
                      {item.before
                        ? changedFields(item.before, item.after).join(", ") ||
                          "No public field difference"
                        : "Initial revision"}
                    </Typography>
                    {item.requestId && (
                      <Typography variant="caption">
                        Request: {item.requestId}
                      </Typography>
                    )}
                    <Typography variant="caption">
                      Context: {JSON.stringify(item.details)}
                    </Typography>
                    <Button
                      startIcon={<RestoreOutlined />}
                      disabled={item.version >= item.currentVersion}
                      onClick={() => {
                        setTarget(item);
                        setReason("");
                        restore.reset();
                      }}
                    >
                      Review restore
                    </Button>
                  </Stack>
                </AccordionDetails>
              </Accordion>
            ))}
            {!listings.data.items.length && (
              <Alert severity="info">No listing changes recorded.</Alert>
            )}
            <Pagination
              page={page}
              count={Math.max(
                1,
                page +
                  (listings.data.items.length === listings.data.pageSize
                    ? 1
                    : 0),
              )}
              onChange={(_, next) => setPage(next)}
            />
          </Stack>
        </Paper>
      )}
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack spacing={2}>
          <Typography variant="h2">Security activity</Typography>
          {security.isPending ? (
            <Loading />
          ) : security.error ? (
            <ErrorState
              error={security.error}
              retry={() => void security.refetch()}
            />
          ) : (
            <Table size="small" aria-label="Security activity">
              <TableHead>
                <TableRow>
                  <TableCell>When</TableCell>
                  <TableCell>Actor</TableCell>
                  <TableCell>Action</TableCell>
                  <TableCell>Reason</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {security.data.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      {new Date(item.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell>{actorLabel(item)}</TableCell>
                    <TableCell>{item.action}</TableCell>
                    <TableCell>{item.reason || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Stack>
      </Paper>
      <Dialog
        open={!!target}
        onClose={() => !restore.isPending && setTarget(null)}
        fullWidth
        maxWidth="lg"
      >
        <DialogTitle>Review restore for {target?.name}</DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            <Typography>
              This will restore revision {target?.version} over the current
              revision {target?.currentVersion}. The operation creates a new
              revision and does not delete history.
            </Typography>
            {target && (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Field</TableCell>
                    <TableCell>Current</TableCell>
                    <TableCell>Restore to</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {changedFields(target.current, target.after).map((field) => (
                    <TableRow key={field}>
                      <TableCell>{field}</TableCell>
                      <TableCell sx={{ overflowWrap: "anywhere" }}>
                        {value(target.current[field])}
                      </TableCell>
                      <TableCell sx={{ overflowWrap: "anywhere" }}>
                        {value(target.after[field])}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            <TextField
              label="Reason for restore"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              slotProps={{ htmlInput: { maxLength: 500 } }}
              fullWidth
            />
            {restore.error && (
              <Alert severity="error">{restore.error.message}</Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTarget(null)} disabled={restore.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => restore.mutate()}
            disabled={!canRestore || restore.isPending}
            startIcon={<RestoreOutlined />}
          >
            Restore as new revision
          </Button>
        </DialogActions>
      </Dialog>
    </Page>
  );
}
