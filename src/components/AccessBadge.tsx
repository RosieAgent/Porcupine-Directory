import { Tooltip } from "@mui/material";
import LockOutlined from "@mui/icons-material/LockOutlined";
import type { Listing } from "../../shared/contracts";

export function AccessBadge({
  listing,
}: {
  listing: Pick<Listing, "accessMode">;
}) {
  if (listing.accessMode !== "invite_only" && listing.accessMode !== "private")
    return null;
  const invite = listing.accessMode === "invite_only";
  return (
    <Tooltip
      describeChild
      title={
        invite
          ? "Invite only — see how to request an invitation. This directory listing and its instructions are public."
          : "Private group — access is controlled by the group. This directory listing and its instructions are public."
      }
    >
      <span
        role="img"
        aria-label={invite ? "Invite only" : "Private group"}
        tabIndex={0}
        style={{ display: "inline-flex", flexShrink: 0 }}
      >
        <LockOutlined color="action" fontSize="small" />
      </span>
    </Tooltip>
  );
}
