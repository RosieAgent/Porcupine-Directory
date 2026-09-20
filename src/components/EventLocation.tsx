import { Link, Tooltip } from "@mui/material";
import PlaceOutlined from "@mui/icons-material/PlaceOutlined";
import { eventLocation } from "../../shared/event-location";
import type { EventLocationInput } from "../../shared/event-location";

export function EventLocation({ event }: { event: EventLocationInput }) {
  const { label, mapsUrl } = eventLocation(event);
  if (!mapsUrl) return <>{label || "Check the source for location details."}</>;
  return (
    <Tooltip title="Search Google Maps (opens a new tab). Check the result against the original event.">
      <Link
        href={mapsUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Search Google Maps for ${label} (opens a new tab)`}
        sx={{ overflowWrap: "anywhere" }}
      >
        <PlaceOutlined
          sx={{ fontSize: "1em", verticalAlign: "middle", mr: 0.5 }}
        />
        {label}
      </Link>
    </Tooltip>
  );
}
