import { Stack, Tooltip } from "@mui/material";
import LightbulbOutlined from "@mui/icons-material/LightbulbOutlined";
import LinkOffOutlined from "@mui/icons-material/LinkOffOutlined";
import PersonSearchOutlined from "@mui/icons-material/PersonSearchOutlined";
import { AccessBadge } from "./AccessBadge";
import type { Listing } from "../../shared/contracts";
import { ConfirmationBadges } from "./ConfirmationBadges";
export function EntryStatus({
  listing,
  confirmation = true,
  access = true,
}: {
  listing: Listing;
  confirmation?: boolean;
  access?: boolean;
}) {
  return (
    <Stack
      direction="row"
      useFlexGap
      sx={{ alignItems: "center", flexWrap: "wrap", gap: 0.75 }}
      data-testid="entry-status"
    >
      {confirmation && <ConfirmationBadges listing={listing} />}
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
