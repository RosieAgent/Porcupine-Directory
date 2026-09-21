import { useState } from "react";
import { OwnershipAssignment } from "../components/OwnershipAssignment";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Button,
  Checkbox,
  FormControlLabel,
  Paper,
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
    >
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={1}
        useFlexGap
        sx={{ alignItems: { sm: "center" }, flexWrap: "wrap" }}
      >
        <Typography>
          Status:{" "}
          {listing.status === "archived"
            ? "Hidden"
            : listing.status === "pending_review"
              ? "Pending publication"
              : "Published"}{" "}
          · revision {listing.version}
        </Typography>
        {listing.status === "published" && (
          <Button component={Link} to={`/listings/${id}`}>
            View public entry
          </Button>
        )}
        {permissions.data?.canReview && (
          <Button
            component={Link}
            to={`/listings/${id}/history`}
            startIcon={<HistoryOutlined />}
          >
            Revision history
          </Button>
        )}
      </Stack>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack spacing={2}>
          <Typography variant="h2">Save changes</Typography>
          <Typography variant="body2" color="text.secondary">
            Make your edits below, then explain what changed. The reason is kept
            in the private revision history and is required before saving.
          </Typography>
          <TextField
            label="Reason for change"
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            helperText="At least 3 characters. Do not include personal information."
            slotProps={{ htmlInput: { maxLength: 500 } }}
          />
        </Stack>
      </Paper>
      {permissions.data?.canConfirm && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Stack spacing={2}>
            <Typography variant="h2">Confirm accuracy</Typography>
            <Typography variant="body2" color="text.secondary">
              This is separate from saving edits. Use it only after reviewing
              the currently saved entry. It records your confirmation date; it
              does not claim ownership or make the entry official.
            </Typography>
            <FormControlLabel
              control={
                <Checkbox
                  checked={attest}
                  onChange={(_, value) => setAttest(value)}
                />
              }
              label="I reviewed the saved entry and believe it is accurate."
            />
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={1}
              useFlexGap
            >
              <Button
                variant="outlined"
                startIcon={<Check />}
                disabled={!attest || !validReason || busy}
                onClick={() => action.mutate("confirm")}
              >
                Confirm saved entry
              </Button>
              {listing.status !== "archived" && (
                <Button
                  color="error"
                  startIcon={<DeleteOutline />}
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
                  Remove from directory
                </Button>
              )}
            </Stack>
          </Stack>
        </Paper>
      )}
      {permissions.data?.canReview && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Stack spacing={2}>
            <Typography variant="h2">Monitor actions</Typography>
            <Typography variant="body2" color="text.secondary">
              These actions apply to the saved revision, not edits that are
              still waiting to be saved.
            </Typography>
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={1}
              useFlexGap
            >
              <Button
                startIcon={<FactCheckOutlined />}
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
                Mark saved entry editor-reviewed
              </Button>
              <Button
                startIcon={
                  listing.status === "published" ? (
                    <VisibilityOffOutlined />
                  ) : (
                    <VisibilityOutlined />
                  )
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
                {listing.status === "published"
                  ? "Hide entry"
                  : "Publish entry"}
              </Button>
              <OwnershipAssignment
                key={id + ":" + user.id}
                listingId={id}
                version={listing.version}
                button
              />
            </Stack>
          </Stack>
        </Paper>
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
        error={update.error}
      />
    </Page>
  );
}
