import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Box,
  Chip,
  MenuItem,
  Pagination,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import EditOutlined from "@mui/icons-material/EditOutlined";
import FlagOutlined from "@mui/icons-material/FlagOutlined";
import Refresh from "@mui/icons-material/Refresh";
import CheckCircleOutlined from "@mui/icons-material/CheckCircleOutlined";
import { useSearchParams } from "react-router";
import { okSchema } from "../../shared/auth";
import {
  entryReportsSchema,
  queueFilters,
  queueQuerySchema,
  reportReasons,
  reviewQueueSchema,
} from "../../shared/moderation";
import type { PrivateReport } from "../../shared/moderation";
import { Page, Loading, ErrorState } from "../components/Page";
import { IconAction, IconLink } from "../components/IconAction";
import { Paging } from "../components/Paging";
import { StaffVerification } from "../components/StaffVerification";
import { mutate, request } from "../lib/api";
import { useAuth } from "../state/AuthProvider";

function Resolution({
  report,
  listingVersion,
  onResolved,
}: {
  report: PrivateReport;
  listingVersion: number;
  onResolved: () => Promise<void>;
}) {
  const [resolution, setResolution] = useState("");
  const [outcome, setOutcome] = useState("resolved");
  const resolve = useMutation({
    mutationFn: () =>
      mutate(`/moderation/reports/${report.id}/resolve`, okSchema, {
        version: report.version,
        listingVersion,
        outcome,
        resolution,
      }),
    onSuccess: onResolved,
  });
  return (
    <Box
      component="form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!resolve.isPending) resolve.mutate();
      }}
    >
      <Stack spacing={2}>
        <TextField
          select
          label="Resolution"
          value={outcome}
          onChange={(event) => setOutcome(event.target.value)}
        >
          <MenuItem value="resolved">Resolved after review</MenuItem>
          <MenuItem value="dismissed">Dismissed after review</MenuItem>
        </TextField>
        <TextField
          label="Private resolution note"
          required
          multiline
          value={resolution}
          onChange={(event) => setResolution(event.target.value)}
          slotProps={{ htmlInput: { minLength: 3, maxLength: 500 } }}
          helperText="Explain the decision. Do not include personal information. This does not edit or confirm the entry."
        />
        <IconAction
          label="Save report resolution"
          type="submit"
          disabled={
            resolve.isPending ||
            resolve.isSuccess ||
            resolution.trim().length < 3
          }
        >
          <CheckCircleOutlined />
        </IconAction>
        {resolve.error && (
          <Alert severity="error">{resolve.error.message}</Alert>
        )}
      </Stack>
    </Box>
  );
}

function EntryReports({
  listingId,
  accountId,
}: {
  listingId: string;
  accountId: string;
}) {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("open");
  const client = useQueryClient();
  const reports = useQuery({
    queryKey: [
      "private",
      "moderation-reports",
      accountId,
      listingId,
      status,
      page,
    ],
    queryFn: ({ signal }) =>
      request(
        `/moderation/entries/${listingId}/reports?status=${status}&page=${page}&pageSize=12`,
        entryReportsSchema,
        { signal },
      ),
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  const refresh = async () => {
    await client.invalidateQueries({
      predicate: (query) =>
        query.queryKey[0] === "private" &&
        String(query.queryKey[1]).startsWith("moderation"),
    });
  };
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={2}>
        <Typography variant="h2" sx={{ fontSize: "1.5rem" }}>
          Private reports
        </Typography>
        <Stack direction="row" spacing={1}>
          <TextField
            select
            label="Report status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
            sx={{ minWidth: 180 }}
          >
            {["open", "resolved", "dismissed", "all"].map((value) => (
              <MenuItem value={value} key={value}>
                {value === "all"
                  ? "All reports"
                  : value[0].toUpperCase() + value.slice(1)}
              </MenuItem>
            ))}
          </TextField>
          <IconAction
            label="Reload reports and entry version"
            onClick={() => void refresh()}
          >
            <Refresh />
          </IconAction>
        </Stack>
        {reports.isPending ? (
          <Loading />
        ) : reports.error ? (
          <ErrorState error={reports.error} />
        ) : (
          <>
            <Typography>
              {reports.data.listing.name} · Entry version{" "}
              {reports.data.listing.version}
            </Typography>
            <IconLink
              label={`Edit ${reports.data.listing.name}`}
              to={`/listings/${listingId}/edit`}
            >
              <EditOutlined />
            </IconLink>
            {reports.data.items.length === 0 && (
              <Alert severity="info">No reports match this status.</Alert>
            )}
            {reports.data.items.map((report) => (
              <Paper
                key={`${report.id}:${report.version}:${reports.data.listing.version}`}
                variant="outlined"
                sx={{ p: 2 }}
              >
                <Stack spacing={2}>
                  <Typography sx={{ fontWeight: 600 }}>
                    {reportReasons[report.reason]}
                  </Typography>
                  <Typography variant="body2">
                    {new Date(report.createdAt).toLocaleString()} ·{" "}
                    {report.status}
                  </Typography>
                  <Typography
                    sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
                  >
                    {report.text || "No additional details."}
                  </Typography>
                  {report.status === "open" ? (
                    <Resolution
                      report={report}
                      listingVersion={reports.data.listing.version}
                      onResolved={refresh}
                    />
                  ) : (
                    <Typography sx={{ overflowWrap: "anywhere" }}>
                      Private decision: {report.resolution}
                    </Typography>
                  )}
                </Stack>
              </Paper>
            ))}
            <Typography role="status">
              {reports.data.total} reports · Page {page}
            </Typography>
            <Pagination
              count={Math.max(
                1,
                Math.ceil(reports.data.total / reports.data.pageSize),
              )}
              page={page}
              onChange={(_event, value) => setPage(value)}
            />
          </>
        )}
      </Stack>
    </Paper>
  );
}

export function ReviewQueuePage() {
  const { user, loading } = useAuth();
  const [params, setParams] = useSearchParams();
  const [selected, setSelected] = useState<string | null>(null);
  const parsed = queueQuerySchema.safeParse(Object.fromEntries(params));
  const query = parsed.success ? parsed.data : queueQuerySchema.parse({});
  const allowed =
    !!user &&
    user.role !== "user" &&
    !user.privilegesSuspended &&
    user.recoverySaved &&
    user.staffVerified;
  const queue = useQuery({
    queryKey: ["private", "moderation-queue", user?.id, query],
    queryFn: ({ signal }) =>
      request(
        "/moderation/queue?" +
          new URLSearchParams({
            filter: query.filter,
            page: String(query.page),
            pageSize: String(query.pageSize),
          }),
        reviewQueueSchema,
        { signal },
      ),
    enabled: allowed,
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });
  return (
    <Page
      title="Review queue"
      description="Review entry quality and private issue reports. Reports do not change directory ranking or entry trust."
      parent={{ label: "Editor workspace", to: "/editor" }}
      account
      shareable={false}
    >
      {loading ? (
        <Loading />
      ) : !user || user.role === "user" ? (
        <Alert severity="info">
          Sign in with an authorized staff account to review entries.
        </Alert>
      ) : (
        <>
          <StaffVerification />
          {allowed && (
            <>
              <Stack direction="row" spacing={1}>
                <TextField
                  select
                  label="Review filter"
                  value={query.filter}
                  sx={{ minWidth: 240 }}
                  onChange={(event) => {
                    setSelected(null);
                    setParams({
                      filter: event.target.value,
                      page: "1",
                      pageSize: String(query.pageSize),
                    });
                  }}
                >
                  {Object.entries(queueFilters).map(([value, label]) => (
                    <MenuItem key={value} value={value}>
                      {label}
                    </MenuItem>
                  ))}
                </TextField>
                <IconAction
                  label="Reload review queue"
                  onClick={() => void queue.refetch()}
                >
                  <Refresh />
                </IconAction>
              </Stack>
              <Typography variant="body2">
                Unconfirmed entries have no owner confirmation or editor review.
                Stale entries have neither within the last 180 days. Oldest
                entries appear first; report volume does not set priority.
              </Typography>
              {queue.isPending ? (
                <Loading />
              ) : queue.error ? (
                <ErrorState
                  error={queue.error}
                  retry={() => void queue.refetch()}
                />
              ) : (
                <>
                  {queue.data.items.length === 0 && (
                    <Alert severity="info">No entries match this filter.</Alert>
                  )}
                  {queue.data.items.map((entry) => (
                    <Paper variant="outlined" sx={{ p: 2 }} key={entry.id}>
                      <Stack spacing={1}>
                        <Typography variant="h2" sx={{ fontSize: "1.25rem" }}>
                          {entry.name}
                        </Typography>
                        <Typography variant="body2">
                          {entry.kind} · {entry.status.replaceAll("_", " ")} ·
                          Version {entry.version}
                        </Typography>
                        <Stack
                          direction="row"
                          useFlexGap
                          sx={{ flexWrap: "wrap", gap: 1 }}
                        >
                          {(
                            [
                              "unconfirmed",
                              "missing",
                              "stale",
                              "reported",
                              "pending",
                            ] as const
                          )
                            .filter((flag) => entry[flag])
                            .map((flag) => (
                              <Chip
                                size="small"
                                key={flag}
                                label={queueFilters[flag]}
                              />
                            ))}
                        </Stack>
                        <Stack direction="row" spacing={1}>
                          <IconLink
                            label={`Edit ${entry.name}`}
                            to={`/listings/${entry.id}/edit`}
                          >
                            <EditOutlined />
                          </IconLink>
                          <IconAction
                            label={`Review reports for ${entry.name}`}
                            onClick={() =>
                              setSelected(
                                selected === entry.id ? null : entry.id,
                              )
                            }
                            aria-expanded={selected === entry.id}
                          >
                            <FlagOutlined />
                          </IconAction>
                        </Stack>
                        {selected === entry.id && (
                          <EntryReports
                            key={`${user.id}:${entry.id}`}
                            listingId={entry.id}
                            accountId={user.id}
                          />
                        )}
                      </Stack>
                    </Paper>
                  ))}
                  <Paging
                    total={queue.data.total}
                    page={query.page}
                    pageSize={query.pageSize}
                  />
                </>
              )}
            </>
          )}
        </>
      )}
    </Page>
  );
}
