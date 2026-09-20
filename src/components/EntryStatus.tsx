import { Stack, Tooltip } from "@mui/material";
import LightbulbOutlined from "@mui/icons-material/LightbulbOutlined";
import LinkOffOutlined from "@mui/icons-material/LinkOffOutlined";
import PersonSearchOutlined from "@mui/icons-material/PersonSearchOutlined";
import { AccessBadge } from "./AccessBadge";
import type { Listing } from "../../shared/contracts";
export function EntryStatus({
  listing,
  access = true,
}: {
  listing: Listing;
  access?: boolean;
}) {
  const hasStatus =
    (access &&
      (listing.accessMode === "invite_only" ||
        listing.accessMode === "private")) ||
    listing.lifecycle === "proposed" ||
    listing.seekingOrganizer ||
    listing.missingJoiningDetails;
  if (!hasStatus) return null;
  return (
    <Stack
      direction="row"
      useFlexGap
      sx={{ alignItems: "center", flexWrap: "wrap", gap: 0.75 }}
      data-testid="entry-status"
    >
      {access && <AccessBadge listing={listing} />}
      {listing.lifecycle === "proposed" && (
        <Tooltip
          describeChild
          title="Idea / proposed — not presented as an operating community"
        >
          <span role="img" aria-label="Idea / proposed" tabIndex={0}>
            <LightbulbOutlined color="info" fontSize="small" />
          </span>
        </Tooltip>
      )}
      {listing.seekingOrganizer && (
        <Tooltip
          describeChild
          title="Seeking an organizer — separate from the private account maintaining this entry. Contact an editor to discuss helping."
        >
          <span role="img" aria-label="Seeking an organizer" tabIndex={0}>
            <PersonSearchOutlined color="info" fontSize="small" />
          </span>
        </Tooltip>
      )}
      {listing.missingJoiningDetails && (
        <Tooltip
          describeChild
          title="Joining details missing — no connection link or usable participation instructions are recorded. This does not mean the group does not exist."
        >
          <span role="img" aria-label="Joining details missing" tabIndex={0}>
            <LinkOffOutlined color="warning" fontSize="small" />
          </span>
        </Tooltip>
      )}
    </Stack>
  );
}
