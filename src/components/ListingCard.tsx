import {
  Card,
  Box,
  CardActions,
  CardContent,
  IconButton,
  Link,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import BookmarkBorder from "@mui/icons-material/BookmarkBorder";
import Bookmark from "@mui/icons-material/Bookmark";
import { Link as RouterLink } from "react-router";
import { accessLabels } from "../../shared/contracts";
import type { Listing } from "../../shared/contracts";
import { useSaved } from "../state/SavedProvider";
import { EntryStatus } from "./EntryStatus";
import { ConnectionLinks } from "./ConnectionLinks";
import { TopicTags } from "./TopicTags";
import { AccessBadge } from "./AccessBadge";

export function SaveButton({ listing }: { listing: Listing }) {
  const { ids, toggle, busy } = useSaved();
  const saved = ids.includes(listing.id);
  const label = (saved ? "Unsave " : "Save ") + listing.name;
  return (
    <Tooltip title={label}>
      <IconButton
        aria-label={label}
        aria-pressed={saved}
        color="primary"
        disabled={busy}
        onClick={() => toggle(listing.id)}
      >
        {saved ? <Bookmark /> : <BookmarkBorder />}
      </IconButton>
    </Tooltip>
  );
}
export function ListingCard({ listing }: { listing: Listing }) {
  return (
    <Card
      component="article"
      sx={{ display: "flex", flexDirection: "column", height: "100%" }}
    >
      <CardContent sx={{ flex: 1 }}>
        <Stack
          direction="row"
          sx={{ mb: 1, justifyContent: "space-between", alignItems: "center" }}
        >
          <Typography
            variant="h3"
            component="h2"
            sx={{ minWidth: 0, overflowWrap: "anywhere" }}
          >
            <Link
              component={RouterLink}
              to={"/listings/" + listing.id}
              underline="hover"
            >
              {listing.name}
            </Link>
          </Typography>
          <Stack
            direction="row"
            spacing={1}
            sx={{ alignItems: "center", flexShrink: 0, ml: 1 }}
            data-testid="card-title-actions"
          >
            <AccessBadge listing={listing} />
            <SaveButton listing={listing} />
          </Stack>
        </Stack>
        <EntryStatus listing={listing} access={false} />
        <Typography color="text.secondary">{listing.summary}</Typography>
        {listing.accessMode !== "unknown" && (
          <Typography variant="body2" sx={{ mt: 2 }}>
            {accessLabels[listing.accessMode]}
          </Typography>
        )}
        {listing.location && (
          <Typography variant="body2" color="text.secondary">
            {listing.location}
          </Typography>
        )}
      </CardContent>
      <Stack sx={{ px: 2, pb: 1 }}>
        <ConnectionLinks connections={listing.connections} />
      </Stack>
      <CardActions
        disableSpacing
        sx={{ px: 2, pb: 2, alignItems: "flex-end", gap: 1 }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <TopicTags tags={listing.tags} compact />
        </Box>
      </CardActions>
    </Card>
  );
}
