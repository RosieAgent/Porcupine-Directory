import { useQuery } from "@tanstack/react-query";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import ExpandMore from "@mui/icons-material/ExpandMore";
import Refresh from "@mui/icons-material/Refresh";
import { eventSyncDiagnosticsResponse } from "../../shared/event-sync-diagnostics";
import { useAuth } from "../state/AuthProvider";
import { request } from "../lib/api";
import { IconAction } from "./IconAction";
import { ErrorState, Loading } from "./Page";

export function EventSyncDiagnostics() {
  const { user } = useAuth();
  const enabled =
    !!user &&
    user.role === "administrator" &&
    user.staffVerified &&
    user.recoverySaved &&
    !user.privilegesSuspended;
  const result = useQuery({
    queryKey: ["private", "event-sync-diagnostics", user?.id],
    queryFn: ({ signal }) =>
      request("/admin/event-sync", eventSyncDiagnosticsResponse, { signal }),
    enabled,
    refetchInterval: 60000,
  });
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={2}>
        <Typography variant="h2">Event import diagnostics</Typography>
        {!enabled ? (
          <Alert severity="info">
            Verify your password above to view private sync diagnostics.
          </Alert>
        ) : result.isPending ? (
          <Loading />
        ) : result.error ? (
          <ErrorState
            error={result.error}
            retry={() => void result.refetch()}
          />
        ) : (
          <>
            <IconAction
              label="Refresh sync diagnostics"
              onClick={() => void result.refetch()}
            >
              <Refresh />
            </IconAction>
            {result.data.sources.map((source) => (
              <Accordion key={source.sourceKey}>
                <AccordionSummary expandIcon={<ExpandMore />}>
                  {source.sourceKey}: {source.status} · {source.skippedCount}{" "}
                  skipped
                </AccordionSummary>
                <AccordionDetails>
                  <Stack spacing={1}>
                    <Typography variant="body2">
                      Diagnostics from last successful snapshot:{" "}
                      {source.diagnosticsAt
                        ? new Date(source.diagnosticsAt).toLocaleString()
                        : "Not checked"}
                      . Last attempt:{" "}
                      {source.lastCheckedAt
                        ? new Date(source.lastCheckedAt).toLocaleString()
                        : "Not checked"}
                      .
                    </Typography>
                    <Typography variant="body2">
                      Malformed recurrence rules are not guessed. Check these
                      source event IDs with FSP before correcting their meaning.
                      A failed check retains the previous snapshot.
                    </Typography>
                    {source.skipped.map((item, index) => (
                      <Typography
                        key={`${item.sourceEventId}-${index}`}
                        variant="body2"
                      >
                        Event {item.sourceEventId}: {item.reason} ({item.code})
                      </Typography>
                    ))}
                    {!source.skipped.length && source.skippedCount > 0 && (
                      <Alert severity="info">
                        Detailed reasons will be available after the next
                        successful poll.
                      </Alert>
                    )}
                  </Stack>
                </AccordionDetails>
              </Accordion>
            ))}
          </>
        )}
      </Stack>
    </Paper>
  );
}
