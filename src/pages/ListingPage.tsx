import { useQuery } from "@tanstack/react-query";
import {
  Alert,
  Chip,
  Paper,
  Stack,
  Typography,
  Link as MuiLink,
} from "@mui/material";
import { useParams } from "react-router";
import { queries } from "../lib/api";
import { safeExternalUrl } from "../lib/urls";
import { accessLabels } from "../../shared/contracts";
import { ReportIssue } from "../components/ReportIssue";
import { ErrorState, Loading, Page } from "../components/Page";
import { IconLink } from "../components/IconAction";
import { ConnectionLinks } from "../components/ConnectionLinks";
import { SaveButton } from "../components/ListingCard";
import { EntryStatus } from "../components/EntryStatus";
import { TopicTags } from "../components/TopicTags";
import { confirmationDate } from "../../shared/trust";
import { useAuth } from "../state/AuthProvider";
import { request } from "../lib/api";
import { z } from "zod";
import EditOutlined from "@mui/icons-material/EditOutlined";
import { RecentPublications } from "../components/RecentPublications";
import { OwnershipAssignment } from "../components/OwnershipAssignment";
export default function ListingPage() {
  const { id = "" } = useParams();
  const result = useQuery(queries.listing(id));
  const { user } = useAuth();
  const permissions = useQuery({
    queryKey: ["private", "permissions", id, user?.id],
    queryFn: () =>
      request(
        `/listings/${id}/permissions`,
        z.object({
          canEdit: z.boolean(),
          canConfirm: z.boolean(),
          canReview: z.boolean(),
        }),
      ),
    enabled: !!user,
  });
  if (result.isPending) return <Loading />;
  if (result.error)
    return (
      <Page title="Listing unavailable" shareable={false}>
        <ErrorState error={result.error} />
      </Page>
    );
  const listing = result.data;
  return (
    <Page
      title={listing.name}
      description={listing.summary}
      parent={{ label: "Explore", to: "/" }}
      shareable={listing.status === "published"}
      actions={
        <>
          <SaveButton listing={listing} />
          <ReportIssue listingId={listing.id} />
          {user && permissions.data?.canEdit && (
            <IconLink label="Edit entry" to={`/listings/${id}/edit`}>
              <EditOutlined />
            </IconLink>
          )}
          {user && permissions.data?.canReview && (
            <OwnershipAssignment
              key={`${id}:${user.id}`}
              listingId={id}
              version={listing.version}
            />
          )}
        </>
      }
    >
      <EntryStatus listing={listing} />
      {listing.lifecycle === "proposed" && (
        <Alert severity="info">
          This is an idea, not a claim that an operating community exists.{" "}
          {listing.seekingOrganizer &&
            "It is seeking someone to help organize it."}{" "}
          Editors can help coordinate corrections; this flag does not give
          anyone account ownership.
        </Alert>
      )}
      {listing.lifecycle !== "proposed" && listing.seekingOrganizer && (
        <Alert severity="info">
          This entry is seeking an organizer. This is separate from the account
          that maintains the listing.
        </Alert>
      )}
      {listing.missingJoiningDetails && (
        <Alert severity="warning">
          Joining details are missing. We have no connection link or usable
          participation instructions; that does not establish whether the
          community exists.
        </Alert>
      )}
      <Stack
        direction="row"
        spacing={1}
        useFlexGap
        sx={{ alignItems: "center", flexWrap: "wrap" }}
      >
        {listing.accessMode !== "unknown" && (
          <Chip label={accessLabels[listing.accessMode]} />
        )}
      </Stack>
      {listing.description && (
        <Paper variant="outlined" sx={{ p: 3 }}>
          <Typography variant="h2" sx={{ mb: 2 }}>
            About
          </Typography>
          <Typography sx={{ whiteSpace: "pre-wrap" }}>
            {listing.description}
          </Typography>
        </Paper>
      )}
      <Paper variant="outlined" sx={{ p: 3 }}>
        <Typography variant="h2" sx={{ mb: 2 }}>
          {listing.accessMode === "invite_only" ||
          listing.accessMode === "private"
            ? "How to request an invitation"
            : "How to participate"}
        </Typography>
        <Typography sx={{ whiteSpace: "pre-wrap" }}>
          {listing.accessInstructions ||
            (listing.accessMode === "invite_only" ||
            listing.accessMode === "private"
              ? "The invitation process has not been provided. Do not assume a listed link grants access."
              : "Participation details have not been confirmed.")}
        </Typography>
        {(listing.accessMode === "invite_only" ||
          listing.accessMode === "private") && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            The group controls invitations. This listing is public; any external
            request service has its own privacy practices. Porcupine Directory
            does not collect or forward invitation requests.
          </Typography>
        )}
        <Stack
          direction="row"
          useFlexGap
          sx={{ mt: 3, flexWrap: "wrap", gap: 1 }}
        >
          <ConnectionLinks connections={listing.connections} />
          {!listing.connections.length && (
            <Typography color="text.secondary">
              No connection links have been provided yet.
            </Typography>
          )}
        </Stack>
      </Paper>
      <RecentPublications listingId={listing.id} />
      {(listing.publicPhone ||
        listing.publicEmail ||
        listing.publicAddress ||
        listing.openingHours) && (
        <Paper variant="outlined" sx={{ p: 3 }}>
          <Stack spacing={1} sx={{ overflowWrap: "anywhere" }}>
            <Typography variant="h2">Public contact</Typography>
            {listing.publicPhone && (
              <MuiLink
                href={`tel:${listing.publicPhone.replace(/[^+0-9]/g, "")}`}
              >
                {listing.publicPhone}
              </MuiLink>
            )}
            {listing.publicEmail && (
              <MuiLink href={`mailto:${listing.publicEmail}`}>
                {listing.publicEmail}
              </MuiLink>
            )}
            {listing.publicAddress && (
              <Typography sx={{ whiteSpace: "pre-wrap" }}>
                {listing.publicAddress}
              </Typography>
            )}
            {listing.openingHours && (
              <Typography sx={{ whiteSpace: "pre-wrap" }}>
                Hours: {listing.openingHours}
              </Typography>
            )}
            <Typography variant="caption">
              Confirm contact details and hours with the original source before
              visiting. A mailing address is not necessarily a public venue.
            </Typography>
          </Stack>
        </Paper>
      )}
      {listing.location && (
        <Typography>Location: {listing.location}</Typography>
      )}
      <TopicTags tags={listing.tags} />
      <Paper
        component="section"
        aria-label="Source information"
        variant="outlined"
        sx={{ p: 3 }}
      >
        <Stack spacing={1}>
          <Typography variant="h2">Source information</Typography>
          <Typography variant="body2">
            Source:{" "}
            {safeExternalUrl(listing.sourceUrl) ? (
              <MuiLink
                href={safeExternalUrl(listing.sourceUrl)!}
                target="_blank"
                rel="noopener noreferrer"
              >
                {listing.sourceName}
              </MuiLink>
            ) : (
              listing.sourceName
            )}
          </Typography>
          {listing.referenceSources.length > 0 && (
            <Stack spacing={1}>
              <Typography variant="h2">Additional sources</Typography>
              <Typography variant="body2">
                Researched from public websites. A source-check date is not
                owner confirmation or editor approval and does not grant a
                confirmation-based ranking boost.
              </Typography>
              {listing.referenceSources.map((source) => (
                <Typography key={source.url} variant="body2">
                  <MuiLink href={source.url} target="_blank" rel="noreferrer">
                    {source.label}
                  </MuiLink>
                  {" · Checked "}
                  {confirmationDate(source.checkedAt)}
                </Typography>
              ))}
            </Stack>
          )}
        </Stack>
      </Paper>
    </Page>
  );
}
