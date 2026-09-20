import { useState } from "react";
import { OwnershipAssignment } from "../components/OwnershipAssignment";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Checkbox,
  FormControlLabel,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useParams, Link } from "react-router";
import { z } from "zod";
import Check from "@mui/icons-material/Check";
import FactCheckOutlined from "@mui/icons-material/FactCheckOutlined";
import VisibilityOutlined from "@mui/icons-material/VisibilityOutlined";
import VisibilityOffOutlined from "@mui/icons-material/VisibilityOffOutlined";
import HistoryOutlined from "@mui/icons-material/HistoryOutlined";
import DeleteOutline from "@mui/icons-material/DeleteOutlined";
import { listingSchema } from "../../shared/contracts";
import type { Submission } from "../../shared/contracts";
import { okSchema } from "../../shared/auth";
import { request, mutate } from "../lib/api";
import { useAuth } from "../state/AuthProvider";
import { Page, Loading, ErrorState } from "../components/Page";
import { ListingForm } from "../components/ListingForm";
import { IconAction, IconLink } from "../components/IconAction";
export default function EditListingPage() {
  const { id = "" } = useParams();
  const { user, loading } = useAuth();
  const client = useQueryClient();
  const [reason, setReason] = useState("");
  const [attest, setAttest] = useState(false);
  const entry = useQuery({
    queryKey: ["private", "edit", id, user?.id],
    queryFn: () => request(`/listings/${id}/edit`, listingSchema),
    enabled: !!user,
  });
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
  const update = useMutation({
    mutationFn: (data: Submission) =>
      mutate(
        `/listings/${id}`,
        okSchema,
        { entry: data, version: entry.data!.version, reason },
        "PUT",
      ),
    onSuccess: async () => {
      setAttest(false);
      await client.invalidateQueries();
    },
  });
  const action = useMutation({
    mutationFn: (action: string) =>
      mutate(`/listings/${id}/action`, okSchema, {
        action,
        version: entry.data!.version,
        reason,
      }),
    onSuccess: async () => {
      setAttest(false);
      await client.invalidateQueries();
    },
  });
  if (loading) return <Loading />;
  if (!user)
    return (
      <Page title="Sign in to edit">
        <Link to="/login">Sign in</Link>
      </Page>
    );
  if (entry.isPending) return <Loading />;
  if (entry.error)
    return (
      <Page title="Entry unavailable">
        <ErrorState error={entry.error} />
        <Link to="/account/security">Account security</Link>
      </Page>
    );
  const listing = entry.data;
  const validReason = reason.trim().length >= 3;
  const busy = update.isPending || action.isPending;
  return (
    <Page
      title={"Manage " + listing.name}
      parent={{ label: "My entries", to: "/account/entries" }}
      shareable={false}
      actions={
        <OwnershipAssignment
          key={`${id}:${user.id}`}
          listingId={id}
          version={listing.version}
        />
      }
    >
      <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
        <Typography>
          {listing.status === "archived"
            ? "Hidden"
            : listing.status === "pending_review"
              ? "Pending publication"
              : "Published"}{" "}
          · revision {listing.version}
        </Typography>
        {permissions.data?.canReview && (
          <IconLink label="Revision history" to={`/listings/${id}/history`}>
            <HistoryOutlined />
          </IconLink>
        )}
      </Stack>
      {listing.status === "published" && (
        <Link to={`/listings/${id}`}>View public entry</Link>
      )}
      {permissions.data?.canConfirm && (
        <>
          {listing.status !== "archived" && (
            <IconAction
              label="Remove entry from directory"
              disabled={!validReason || busy}
              onClick={() => {
                if (
                  window.confirm(
                    "Remove this entry from public browsing? It will remain in My entries and private revision history. An editor can restore publication.",
                  )
                )
                  action.mutate("hide");
              }}
            >
              <DeleteOutline />
            </IconAction>
          )}
          <FormControlLabel
            control={
              <Checkbox
                checked={attest}
                onChange={(_, value) => setAttest(value)}
              />
            }
            label="I confirm that the currently saved entry is accurate to the best of my knowledge"
          />
          <IconAction
            label="Self-confirm saved entry"
            disabled={!attest || !validReason || busy}
            onClick={() => action.mutate("confirm")}
          >
            <Check />
          </IconAction>
        </>
      )}
      {permissions.data?.canReview && (
        <>
          <Typography variant="body2">
            Review and publication actions apply to the saved revision, not
            unsaved form changes.
          </Typography>
          <Stack direction="row" spacing={2}>
            <IconAction
              label="Mark saved entry editor-reviewed"
              disabled={!validReason || busy}
              onClick={() => {
                if (
                  window.confirm(
                    "Have you reviewed the currently saved information? This does not certify its accuracy.",
                  )
                )
                  action.mutate("review");
              }}
            >
              <FactCheckOutlined />
            </IconAction>
            <IconAction
              label={
                listing.status === "published" ? "Hide entry" : "Publish entry"
              }
              disabled={!validReason || busy}
              onClick={() => {
                if (
                  window.confirm(
                    listing.status === "published"
                      ? "Hide this entry from public browsing?"
                      : "Publish this entry?",
                  )
                )
                  action.mutate(
                    listing.status === "published" ? "hide" : "publish",
                  );
              }}
            >
              {listing.status === "published" ? (
                <VisibilityOffOutlined />
              ) : (
                <VisibilityOutlined />
              )}
            </IconAction>
          </Stack>
        </>
      )}
      {action.error && <Alert severity="error">{action.error.message}</Alert>}
      {(action.isSuccess || update.isSuccess) && (
        <Alert severity="success">
          Entry updated. Content edits clear previous confirmation and review
          badges.
        </Alert>
      )}
      <ListingForm
        key={listing.version}
        initial={{
          kind: listing.kind,
          name: listing.name,
          summary: listing.summary,
          description: listing.description,
          url: listing.url ?? "",
          connections: listing.connections,
          contactUrl: listing.contactUrl ?? "",
          location: listing.location ?? "",
          tags: listing.tags,
          accessMode: listing.accessMode,
          accessInstructions: listing.accessInstructions,
          lifecycle: listing.lifecycle,
          seekingOrganizer: listing.seekingOrganizer,
          publicPhone: listing.publicPhone,
          publicEmail: listing.publicEmail,
          publicAddress: listing.publicAddress,
          openingHours: listing.openingHours,
        }}
        onSave={(data) => {
          if (validReason && !busy) update.mutate(data);
        }}
        pending={busy}
        disabled={!validReason}
        beforeSubmit={
          <TextField
            label="Reason for change"
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            helperText="At least 3 characters. Recorded in the private revision history. Do not include personal information."
            slotProps={{ htmlInput: { maxLength: 500 } }}
          />
        }
        error={update.error}
      />
    </Page>
  );
}
