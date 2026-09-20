import { useQuery } from "@tanstack/react-query";
import { Alert, Link, Paper, Stack, Typography } from "@mui/material";
import { queries } from "../lib/api";
import { dateLabel, safeExternalUrl } from "../lib/urls";
import { eventSources } from "../../shared/event-sources";

export function EventSourceStatus() {
  const result = useQuery(queries.sources);
  if (result.isPending)
    return (
      <Typography variant="body2">Checking calendar freshness…</Typography>
    );
  if (result.error)
    return (
      <Alert severity="warning">
        Calendar freshness is unavailable. Confirm details with the original
        source.
      </Alert>
    );
  return (
    <Stack spacing={1}>
      {result.data.sources
        .filter((source) => source.sourceKey in eventSources)
        .map((source) => {
          const stale =
            !source.lastSyncedAt ||
            result.dataUpdatedAt - new Date(source.lastSyncedAt).getTime() >
              2 * 60 * 60 * 1000;
          return (
            <Paper key={source.sourceKey} variant="outlined" sx={{ p: 2 }}>
              <Typography variant="subtitle2">
                <Link
                  href={safeExternalUrl(source.sourceUrl)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {source.displayName}
                </Link>
                {" · "}
                {source.pollIntervalMinutes
                  ? "Checked every hour"
                  : "Automatic polling is disabled"}
              </Typography>
              <Typography variant="body2" sx={{ mt: 0.5 }}>
                Last checked:{" "}
                {source.lastCheckedAt
                  ? dateLabel(source.lastCheckedAt)
                  : "Not yet polled"}
                {" · "}Last updated:{" "}
                {source.lastSyncedAt
                  ? dateLabel(source.lastSyncedAt)
                  : "No successful import yet"}
              </Typography>
              {source.nextPollAt && (
                <Typography variant="body2" color="text.secondary">
                  Next check due around {dateLabel(source.nextPollAt)} while the
                  server is running.
                </Typography>
              )}
              {source.coverageFrom && source.coverageTo && (
                <Typography variant="body2" color="text.secondary">
                  Imported window:{" "}
                  {new Date(source.coverageFrom).toLocaleDateString("en-US", {
                    timeZone: "America/New_York",
                  })}
                  –
                  {new Date(source.coverageTo).toLocaleDateString("en-US", {
                    timeZone: "America/New_York",
                  })}
                  . Dates outside this window may be incomplete.
                </Typography>
              )}
              {source.status === "running" && (
                <Alert severity="info" sx={{ mt: 1 }}>
                  A calendar check is in progress. The previous snapshot remains
                  available.
                </Alert>
              )}
              {(source.status === "error" || stale) && (
                <Alert severity="warning" sx={{ mt: 1 }}>
                  {source.status === "error"
                    ? "The latest check failed. Previously imported events have been kept."
                    : "The calendar has not been updated recently."}{" "}
                  Please verify plans on the source calendar.
                </Alert>
              )}
              {source.skippedCount > 0 && (
                <Alert severity="info" sx={{ mt: 1 }}>
                  {source.skippedCount} source records have unreadable
                  recurrence rules. This calendar may be incomplete; check FSP
                  for the full schedule.
                </Alert>
              )}
            </Paper>
          );
        })}
    </Stack>
  );
}
