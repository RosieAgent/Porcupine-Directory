import { useState } from "react";
import { useParams, Link } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Pagination,
  Paper,
  Stack,
  TextField,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from "@mui/material";
import RestoreOutlined from "@mui/icons-material/RestoreOutlined";
import Close from "@mui/icons-material/Close";
import { z } from "zod";
import { request, mutate } from "../lib/api";
import { listingSchema } from "../../shared/contracts";
import { okSchema } from "../../shared/auth";
import { Page, Loading, ErrorState } from "../components/Page";
import { IconAction } from "../components/IconAction";
import { useAuth } from "../state/AuthProvider";
const revision = z.object({
  version: z.number(),
  action: z.string(),
  reason: z.string(),
  actorId: z.string().nullable(),
  before: z.record(z.string(), z.unknown()).nullable(),
  after: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
});
const fields = [
  "kind",
  "name",
  "summary",
  "description",
  "url",
  "contact_url",
  "location",
  "tags",
  "access_mode",
  "access_instructions",
  "links",
  "connections",
  "lifecycle",
  "seeking_organizer",
  "public_phone",
  "public_email",
  "public_address",
  "opening_hours",
  "reference_sources",
];
export default function HistoryPage() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [target, setTarget] = useState<z.infer<typeof revision> | null>(null);
  const [reason, setReason] = useState("");
  const client = useQueryClient();
  const history = useQuery({
    queryKey: ["private", "history", id, page, user?.id],
    queryFn: () =>
      request(
        `/listings/${id}/history?page=${page}`,
        z.object({ items: z.array(revision), page: z.number() }),
      ),
  });
  const entry = useQuery({
    queryKey: ["private", "edit", id, user?.id],
    queryFn: () => request(`/listings/${id}/edit`, listingSchema),
  });
  const restore = useMutation({
    mutationFn: () =>
      mutate(`/listings/${id}/restore`, okSchema, {
        version: entry.data!.version,
        targetVersion: target!.version,
        reason,
      }),
    onSuccess: async () => {
      setTarget(null);
      setReason("");
      await client.invalidateQueries();
    },
  });
  const current = entry.data
    ? {
        ...entry.data,
        contact_url: entry.data.contactUrl,
        seeking_organizer: entry.data.seekingOrganizer,
        public_phone: entry.data.publicPhone,
        public_email: entry.data.publicEmail,
        public_address: entry.data.publicAddress,
        opening_hours: entry.data.openingHours,
        reference_sources: entry.data.referenceSources,
        access_mode: entry.data.accessMode,
        access_instructions: entry.data.accessInstructions,
      }
    : null;
  return (
    <Page
      title="Revision history"
      parent={{ label: "Manage entry", to: `/listings/${id}/edit` }}
      account
      description="Restoring creates a new revision. Ownership, publication state and trust badges are not restored."
    >
      {history.isPending ? (
        <Loading />
      ) : history.error ? (
        <>
          <ErrorState error={history.error} />
          <Link to="/account/security">Account security</Link>
        </>
      ) : (
        <>
          {history.data.items.map((item) => (
            <Paper variant="outlined" key={item.version} sx={{ p: 2 }}>
              <Stack
                direction="row"
                sx={{ justifyContent: "space-between", alignItems: "center" }}
              >
                <Stack>
                  <Typography>
                    Revision {item.version} · {item.action} ·{" "}
                    {new Date(item.createdAt).toLocaleString()}
                  </Typography>
                  <Typography>{item.reason}</Typography>
                  <Typography variant="caption">
                    Actor: {item.actorId ?? "Anonymous / source service"}
                  </Typography>
                  <Typography variant="body2">
                    Changed:{" "}
                    {item.before
                      ? Object.keys(item.after)
                          .filter(
                            (key) =>
                              !["version", "updated_at"].includes(key) &&
                              JSON.stringify(item.before![key]) !==
                                JSON.stringify(item.after[key]),
                          )
                          .join(", ")
                      : "Initial revision"}
                  </Typography>
                </Stack>
                <IconAction
                  label={"Preview restore of revision " + item.version}
                  disabled={!current || item.version === entry.data?.version}
                  onClick={() => {
                    setTarget(item);
                    restore.reset();
                  }}
                >
                  <RestoreOutlined />
                </IconAction>
              </Stack>
            </Paper>
          ))}
          <Pagination
            page={page}
            count={page + (history.data.items.length === 20 ? 1 : 0)}
            onChange={(_, value) => setPage(value)}
          />
        </>
      )}
      {restore.isSuccess && (
        <Alert severity="success">Restored as a new revision.</Alert>
      )}
      <Dialog
        open={!!target}
        onClose={() => !restore.isPending && setTarget(null)}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>Restore revision {target?.version}?</DialogTitle>
        <DialogContent>
          <Typography>
            Compare the saved content below. This does not restore old
            ownership, visibility or confirmation.
          </Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Field</TableCell>
                <TableCell>Current</TableCell>
                <TableCell>Restore</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {target &&
                current &&
                fields.map((field) => (
                  <TableRow key={field}>
                    <TableCell>{field}</TableCell>
                    <TableCell sx={{ overflowWrap: "anywhere" }}>
                      {JSON.stringify(current[field as keyof typeof current])}
                    </TableCell>
                    <TableCell sx={{ overflowWrap: "anywhere" }}>
                      {JSON.stringify(target.after[field])}
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
          <TextField
            fullWidth
            label="Reason for restore"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            sx={{ mt: 2 }}
          />
          {restore.error && (
            <Alert severity="error">{restore.error.message}</Alert>
          )}
        </DialogContent>
        <DialogActions>
          <IconAction
            label="Cancel restore"
            disabled={restore.isPending}
            onClick={() => setTarget(null)}
          >
            <Close />
          </IconAction>
          <IconAction
            label="Confirm restore"
            disabled={restore.isPending || reason.trim().length < 3}
            onClick={() => restore.mutate()}
          >
            <RestoreOutlined />
          </IconAction>
        </DialogActions>
      </Dialog>
    </Page>
  );
}
