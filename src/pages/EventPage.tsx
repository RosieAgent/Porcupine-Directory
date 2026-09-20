import { useQuery } from "@tanstack/react-query";
import { Alert, Paper, Typography } from "@mui/material";
import { useParams } from "react-router";
import { queries } from "../lib/api";
import { dateLabel, safeExternalUrl } from "../lib/urls";
import { ErrorState, Loading, Page } from "../components/Page";
import { IconLink } from "../components/IconAction";
import OpenInNew from "@mui/icons-material/OpenInNew";
import { EventSourceStatus } from "../components/EventSourceStatus";
import { EventLocation } from "../components/EventLocation";
import { eventSourceName } from "../../shared/event-sources";
export default function EventPage() {
  const { id = "" } = useParams();
  const result = useQuery(queries.event(id));
  if (result.isPending) return <Loading />;
  if (result.error)
    return (
      <Page title="Event unavailable">
        <ErrorState error={result.error} />
      </Page>
    );
  const event = result.data;
  return (
    <Page title={event.title} parent={{ label: "Events", to: "/events" }}>
      {event.hidden && (
        <Alert severity="warning">
          This occurrence is no longer in the current calendar snapshot. Check
          the original source for changes or cancellation.
        </Alert>
      )}
      {new Date(event.endsAt ?? event.startsAt) < new Date() && (
        <Alert severity="info">
          This event is in the past. Its link remains available for reference.
        </Alert>
      )}
      <Paper variant="outlined" sx={{ p: 3 }}>
        <Typography variant="h2">
          {dateLabel(event.startsAt, event.allDay)}
        </Typography>
        {event.endsAt && (
          <Typography sx={{ mt: 1 }}>
            Until {dateLabel(event.endsAt, event.allDay)}
          </Typography>
        )}
        <Typography sx={{ mt: 2 }}>
          <EventLocation event={event} />
        </Typography>
      </Paper>
      <Typography sx={{ whiteSpace: "pre-wrap" }}>
        {event.description || "See the original event for details."}
      </Typography>
      {safeExternalUrl(event.url) && (
        <IconLink
          href={safeExternalUrl(event.url)!}
          label="View original event"
        >
          <OpenInNew />
        </IconLink>
      )}
      <Typography variant="body2" color="text.secondary">
        {eventSourceName(event.sourceKey)} · Updated{" "}
        {dateLabel(event.lastSyncedAt)}. Confirm details with the organizer.
      </Typography>
      <EventSourceStatus />
    </Page>
  );
}
