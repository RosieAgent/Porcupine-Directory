import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Pagination,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import ExpandMore from "@mui/icons-material/ExpandMore";
import OpenInNewOutlined from "@mui/icons-material/OpenInNewOutlined";
import RefreshOutlined from "@mui/icons-material/RefreshOutlined";
import RestoreOutlined from "@mui/icons-material/RestoreOutlined";
import { z } from "zod";
import { okSchema } from "../../shared/auth";
import { mutate, request } from "../lib/api";
import { useAuth } from "../state/AuthProvider";
import { ErrorState, Loading, Page } from "./Page";
import { StaffVerification } from "./StaffVerification";
import { AdminWorkspaceNav } from "./AdminWorkspaceNav";

const jsonObject = z.record(z.string(), z.unknown());
const activitySchema = z.object({
  id: z.string(),
  category: z.enum([
    "listing",
    "event",
    "image",
    "account",
    "service",
    "auth",
    "security",
    "system",
  ]),
  action: z.string(),
  actorType: z.enum(["account", "service_account", "system"]),
  actorId: z.string().nullable(),
  actorName: z.string().nullable(),
  subjectType: z.string(),
  subjectId: z.string().nullable(),
  subjectName: z.string().nullable(),
  requestId: z.string().nullable(),
  reason: z.string(),
  details: jsonObject,
  outcome: z.string(),
  createdAt: z.string(),
  version: z.number().nullable(),
  before: jsonObject.nullable(),
  after: jsonObject.nullable(),
  current: jsonObject.nullable(),
  currentVersion: z.number().nullable(),
  listingStatus: z.enum(["published", "pending_review", "archived"]).nullable(),
  editorReviewedAt: z.string().nullable(),
});
const activityResponse = z.object({
  items: z.array(activitySchema),
  page: z.number(),
  pageSize: z.number(),
  total: z.number(),
  hasMore: z.boolean(),
});

const displayFields = [
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
const eventDisplayFields = [
  "title",
  "description",
  "starts_at",
  "ends_at",
  "venue",
  "city",
  "url",
  "hidden",
];
const fieldLabels: Record<string, string> = {
  access_instructions: "joining instructions",
  access_mode: "access",
  contact_url: "contact link",
  description: "description",
  kind: "type",
  links: "links",
  location: "location",
  lifecycle: "stage",
  name: "name",
  opening_hours: "hours",
  public_address: "public address",
  public_email: "public email",
  public_phone: "public phone",
  reference_sources: "sources",
  seeking_organizer: "organizer status",
  summary: "summary",
  tags: "tags",
  url: "website",
  connections: "connections",
  title: "title",
  starts_at: "start time",
  ends_at: "end time",
  venue: "venue",
  city: "city",
  hidden: "visibility",
};
type Activity = z.infer<typeof activitySchema>;

function changedFields(item: Activity) {
  const { before, after } = item;
  if (!after) return [];
  const fields = item.category === "event" ? eventDisplayFields : displayFields;
  if (!before) return fields.filter((field) => field in after);
  return fields.filter(
    (field) => JSON.stringify(before[field]) !== JSON.stringify(after[field]),
  );
}

function actorLabel(item: Activity) {
  return (
    item.actorName ??
    (item.actorType === "system"
      ? "System"
      : item.actorType === "service_account"
        ? "Service account"
        : "Deleted account")
  );
}

function actionLabel(item: Activity) {
  if (
    ["create", "listing.created", "service.listing.created"].includes(
      item.action,
    )
  )
    return "Listing added";
  if (["listing.updated", "service.listing.updated"].includes(item.action))
    return "Listing edited";
  if (item.action === "listing.restored") return "Listing restored";
  if (item.action === "listing.image.uploaded") return "Image added";
  if (item.action === "listing.image.updated") return "Image details changed";
  if (item.action === "listing.image.removed") return "Image removed";
  if (item.action === "service-account.deleted")
    return "Service account deleted";
  if (item.action === "event.imported") return "Calendar event imported";
  if (item.action === "event.updated") return "Calendar event updated";
  return item.action
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formattedDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function json(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function imagePreviewUrl(item: Activity) {
  const imageId = item.details.imageId;
  if (
    item.category !== "image" ||
    typeof imageId !== "string" ||
    !item.subjectId
  )
    return null;
  return `/api/listings/${item.subjectId}/images/${imageId}`;
}

export function AdminAudit() {
  const { user } = useAuth();
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const [period, setPeriod] = useState("7d");
  const [category, setCategory] = useState("all");
  const [actor, setActor] = useState("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | false>(false);
  const [target, setTarget] = useState<Activity | null>(null);
  const [reason, setReason] = useState("");
  const activity = useQuery({
    queryKey: [
      "private",
      "admin-activity",
      user?.id,
      page,
      period,
      category,
      actor,
      search,
    ],
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page),
        period,
        category,
        actor,
        search,
      });
      return request(`/admin/audit/activity?${params}`, activityResponse);
    },
    enabled: !!user?.staffVerified,
    refetchInterval: 30_000,
  });
  const restore = useMutation({
    mutationFn: () => {
      if (!target?.subjectId || target.version === null)
        throw new Error("Choose a listing revision first.");
      if (target.currentVersion === null)
        throw new Error("Deleted entries cannot be restored from this page.");
      return mutate(`/listings/${target.subjectId}/restore`, okSchema, {
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
    target.category === "listing" &&
    target.version !== null &&
    target.currentVersion !== null &&
    target.version < target.currentVersion &&
    reason.trim().length >= 3;
  const setFilter = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    setPage(1);
  };

  return (
    <Page
      title="Site activity"
      parent={{ label: "Administration", to: "/admin" }}
      account
      description="Review recent listing changes, image uploads, account actions, and service activity. Newest events appear first."
    >
      <AdminWorkspaceNav active="/admin/audit" />
      <StaffVerification />
      {!user?.staffVerified ? (
        <Alert severity="info">
          Verify your staff session to view private account and activity data.
        </Alert>
      ) : activity.isPending ? (
        <Loading />
      ) : activity.error ? (
        <ErrorState
          error={activity.error}
          retry={() => void activity.refetch()}
        />
      ) : (
        <Stack spacing={2}>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack spacing={2}>
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: {
                    xs: "minmax(0, 1fr)",
                    sm: "repeat(2, minmax(0, 1fr))",
                    lg: "minmax(150px, 0.8fr) minmax(180px, 1fr) minmax(170px, 0.9fr) minmax(220px, 1.4fr) auto",
                  },
                  gap: 1.5,
                  alignItems: "center",
                }}
              >
                <TextField
                  select
                  label="Time range"
                  value={period}
                  onChange={(event) => setFilter(setPeriod)(event.target.value)}
                  fullWidth
                  sx={{ minWidth: 0 }}
                >
                  <MenuItem value="24h">Past 24 hours</MenuItem>
                  <MenuItem value="7d">Past 7 days</MenuItem>
                  <MenuItem value="30d">Past 30 days</MenuItem>
                  <MenuItem value="all">All activity</MenuItem>
                </TextField>
                <TextField
                  select
                  label="Activity type"
                  value={category}
                  onChange={(event) =>
                    setFilter(setCategory)(event.target.value)
                  }
                  fullWidth
                  sx={{ minWidth: 0 }}
                >
                  <MenuItem value="all">All types</MenuItem>
                  <MenuItem value="listing">Listing changes</MenuItem>
                  <MenuItem value="event">Calendar imports</MenuItem>
                  <MenuItem value="image">Image changes</MenuItem>
                  <MenuItem value="account">Account changes</MenuItem>
                  <MenuItem value="service">Service accounts</MenuItem>
                  <MenuItem value="auth">Sign-in and recovery</MenuItem>
                  <MenuItem value="security">Other security</MenuItem>
                  <MenuItem value="system">System activity</MenuItem>
                </TextField>
                <TextField
                  select
                  label="Actor"
                  value={actor}
                  onChange={(event) => setFilter(setActor)(event.target.value)}
                  fullWidth
                  sx={{ minWidth: 0 }}
                >
                  <MenuItem value="all">All actors</MenuItem>
                  <MenuItem value="account">People and monitors</MenuItem>
                  <MenuItem value="service_account">
                    Services and agents
                  </MenuItem>
                  <MenuItem value="system">System</MenuItem>
                </TextField>
                <TextField
                  label="Search activity"
                  value={search}
                  onChange={(event) => setFilter(setSearch)(event.target.value)}
                  slotProps={{ htmlInput: { maxLength: 120 } }}
                  fullWidth
                  sx={{ minWidth: 0 }}
                />
                <Button
                  startIcon={<RefreshOutlined />}
                  onClick={() => void activity.refetch()}
                  disabled={activity.isFetching}
                  sx={{ justifySelf: { xs: "stretch", lg: "end" } }}
                >
                  Refresh
                </Button>
              </Box>
              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={1}
                sx={{
                  alignItems: { sm: "center" },
                  justifyContent: "space-between",
                }}
              >
                <Typography role="status" color="text.secondary">
                  {activity.data.total} matching event
                  {activity.data.total === 1 ? "" : "s"}. Refreshes every 30
                  seconds.
                </Typography>
                <Button
                  onClick={() => {
                    setPeriod("7d");
                    setCategory("all");
                    setActor("all");
                    setSearch("");
                    setPage(1);
                  }}
                  disabled={
                    period === "7d" &&
                    category === "all" &&
                    actor === "all" &&
                    !search
                  }
                >
                  Reset filters
                </Button>
              </Stack>
            </Stack>
          </Paper>

          {!activity.data.items.length ? (
            <Alert severity="info">
              No activity matches these filters. Try a wider time range or reset
              the filters.
            </Alert>
          ) : (
            <Stack spacing={1}>
              {activity.data.items.map((item) => {
                const fields = changedFields(item);
                const imageUrl = imagePreviewUrl(item);
                const isUnreviewed =
                  item.category === "listing" &&
                  item.listingStatus === "published" &&
                  !item.editorReviewedAt;
                return (
                  <Accordion
                    key={item.id}
                    disableGutters
                    expanded={expanded === item.id}
                    onChange={(_, open) => setExpanded(open ? item.id : false)}
                  >
                    <AccordionSummary expandIcon={<ExpandMore />}>
                      <Stack
                        direction={{ xs: "column", sm: "row" }}
                        spacing={1}
                        useFlexGap
                        sx={{
                          alignItems: { xs: "flex-start", sm: "center" },
                          minWidth: 0,
                          width: "100%",
                          flexWrap: "wrap",
                        }}
                      >
                        <Stack sx={{ minWidth: 0, flex: 1 }}>
                          <Typography sx={{ overflowWrap: "anywhere" }}>
                            {actionLabel(item)}
                            {item.subjectName ? ` · ${item.subjectName}` : ""}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {formattedDate(item.createdAt)} · {actorLabel(item)}
                          </Typography>
                        </Stack>
                        <Stack
                          direction="row"
                          spacing={0.75}
                          useFlexGap
                          sx={{
                            alignItems: "center",
                            flexWrap: "wrap",
                            minWidth: 0,
                          }}
                        >
                          <Chip size="small" label={item.category} />
                          {isUnreviewed && (
                            <Chip
                              size="small"
                              color="warning"
                              label="Published · not editor-reviewed"
                            />
                          )}
                          {item.outcome !== "success" && (
                            <Chip
                              size="small"
                              color="error"
                              label={item.outcome}
                            />
                          )}
                        </Stack>
                      </Stack>
                    </AccordionSummary>
                    <AccordionDetails>
                      <Stack spacing={1.5}>
                        <Stack
                          direction={{ xs: "column", sm: "row" }}
                          spacing={1}
                        >
                          <Typography variant="body2">
                            <strong>Actor:</strong> {actorLabel(item)} (
                            {item.actorType.replaceAll("_", " ")})
                          </Typography>
                          <Typography variant="body2">
                            <strong>When:</strong>{" "}
                            {formattedDate(item.createdAt)}
                          </Typography>
                          {item.version !== null && (
                            <Typography variant="body2">
                              <strong>Revision:</strong> {item.version}
                            </Typography>
                          )}
                        </Stack>
                        <Typography variant="body2">
                          <strong>Reason:</strong>{" "}
                          {item.reason || "Not supplied"}
                        </Typography>
                        {fields.length > 0 && (
                          <Typography variant="body2">
                            <strong>Changed:</strong>{" "}
                            {fields
                              .map((field) => fieldLabels[field] ?? field)
                              .join(", ")}
                          </Typography>
                        )}
                        {item.category === "image" && (
                          <Stack spacing={1}>
                            <Typography variant="body2">
                              <strong>Image:</strong>{" "}
                              {typeof item.details.mimeType === "string"
                                ? item.details.mimeType
                                : "image"}
                              {typeof item.details.bytes === "number"
                                ? ` · ${Math.ceil(item.details.bytes / 1024)} KB`
                                : ""}
                              {item.details.shareable === true
                                ? " · used as community card image"
                                : ""}
                            </Typography>
                            {imageUrl && (
                              <img
                                src={imageUrl}
                                alt={item.subjectName ?? "Listing image"}
                                loading="lazy"
                                style={{
                                  maxWidth: 360,
                                  maxHeight: 240,
                                  objectFit: "contain",
                                  objectPosition: "left center",
                                }}
                              />
                            )}
                          </Stack>
                        )}
                        {item.requestId && (
                          <Typography variant="caption">
                            Request ID: {item.requestId}
                          </Typography>
                        )}
                        {Object.keys(item.details).length > 0 && (
                          <details>
                            <summary>Event context</summary>
                            <pre
                              style={{
                                maxHeight: 240,
                                overflow: "auto",
                                whiteSpace: "pre-wrap",
                                overflowWrap: "anywhere",
                              }}
                            >
                              {json(item.details)}
                            </pre>
                          </details>
                        )}
                        <Stack
                          direction="row"
                          spacing={1}
                          useFlexGap
                          sx={{ flexWrap: "wrap" }}
                        >
                          {item.subjectId &&
                            ["listing", "image", "event"].includes(
                              item.category,
                            ) && (
                              <Button
                                component="a"
                                href={
                                  item.category === "event"
                                    ? `/events/${item.subjectId}`
                                    : `/listings/${item.subjectId}`
                                }
                                startIcon={<OpenInNewOutlined />}
                              >
                                {item.category === "event"
                                  ? "Open event"
                                  : "Open listing"}
                              </Button>
                            )}
                          {item.category === "listing" &&
                            item.version !== null && (
                              <Button
                                startIcon={<RestoreOutlined />}
                                disabled={
                                  item.currentVersion === null ||
                                  item.version >= (item.currentVersion ?? 0)
                                }
                                onClick={() => {
                                  setTarget(item);
                                  setReason("");
                                  restore.reset();
                                }}
                              >
                                Review restore
                              </Button>
                            )}
                        </Stack>
                      </Stack>
                    </AccordionDetails>
                  </Accordion>
                );
              })}
              <Pagination
                page={page}
                count={Math.max(
                  1,
                  Math.ceil(activity.data.total / activity.data.pageSize),
                )}
                onChange={(_, next) => setPage(next)}
              />
            </Stack>
          )}
        </Stack>
      )}
      <Dialog
        open={!!target}
        onClose={() => !restore.isPending && setTarget(null)}
        fullWidth
        maxWidth="lg"
      >
        <DialogTitle>Review restore for {target?.subjectName}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography>
              {target?.currentVersion === null
                ? "This entry was permanently deleted. Its historical revision is retained for audit and cannot be restored here."
                : `This creates a new revision from revision ${target?.version} over current revision ${target?.currentVersion}. Earlier history is retained.`}
            </Typography>
            {target && (
              <Stack spacing={1}>
                {changedFields(target).map((field) => (
                  <Paper key={field} variant="outlined" sx={{ p: 1.5 }}>
                    <Typography variant="subtitle2">
                      {fieldLabels[field] ?? field}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Current: {JSON.stringify(target.current?.[field] ?? null)}
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{ overflowWrap: "anywhere" }}
                    >
                      Restore: {JSON.stringify(target.after?.[field] ?? null)}
                    </Typography>
                  </Paper>
                ))}
              </Stack>
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
