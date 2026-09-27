import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useParams, Link, useNavigate } from "react-router";
import { z } from "zod";
import { listingSchema } from "../../shared/contracts";
import type { Submission } from "../../shared/contracts";
import { okSchema } from "../../shared/auth";
import { request, mutate } from "../lib/api";
import { useAuth } from "../state/AuthProvider";
import { Page, Loading, ErrorState } from "../components/Page";
import { ListingForm } from "../components/ListingForm";
import { EntryActionsMenu } from "../components/EntryActionsMenu";
import {
  ListingImagesEditor,
  type ListingImagesEditorHandle,
} from "../components/EntryImages";

const EDIT_FORM_ID = "edit-listing-form";

type ReasonContinuation = (reason: string) => void | Promise<void>;

export default function EditListingPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const client = useQueryClient();
  const imageEditorRef = useRef<ListingImagesEditorHandle>(null);
  const [reason, setReason] = useState("");
  const [reasonDialogOpen, setReasonDialogOpen] = useState(false);
  const [reasonDialogError, setReasonDialogError] = useState("");
  const [reasonContinuation, setReasonContinuation] =
    useState<ReasonContinuation | null>(null);
  const [formDirty, setFormDirty] = useState(false);
  const [imageDirty, setImageDirty] = useState(false);

  const entry = useQuery({
    queryKey: ["private", "edit", id, user?.id],
    queryFn: () => request("/listings/" + id + "/edit", listingSchema),
    enabled: !!user,
  });
  const permissions = useQuery({
    queryKey: ["private", "permissions", id, user?.id],
    queryFn: () =>
      request(
        "/listings/" + id + "/permissions",
        z.object({
          isOwner: z.boolean(),
          canEdit: z.boolean(),
          canConfirm: z.boolean(),
          canReview: z.boolean(),
          canDelete: z.boolean(),
          reasonRequired: z.boolean(),
        }),
      ),
    enabled: !!user,
  });
  const reasonRequired = permissions.data?.reasonRequired ?? false;
  const update = useMutation({
    mutationFn: async ({
      data,
      changeReason,
    }: {
      data: Submission;
      changeReason: string;
    }) => {
      await mutate(
        "/listings/" + id,
        okSchema,
        {
          entry: data,
          version: entry.data!.version,
          reason: changeReason,
        },
        "PUT",
      );
      await imageEditorRef.current?.saveChanges(changeReason);
    },
    onSuccess: async () => {
      await client.invalidateQueries();
      navigate("/listings/" + id, {
        state: {
          snackbar: {
            severity: "success",
            message:
              "Entry updated. Previous confirmation and review badges were cleared.",
          },
        },
      });
    },
  });
  const action = useMutation({
    mutationFn: ({
      action: actionName,
      changeReason,
    }: {
      action: string;
      changeReason: string;
    }) =>
      mutate("/listings/" + id + "/action", okSchema, {
        action: actionName,
        version: entry.data!.version,
        reason: changeReason,
      }),
    onSuccess: async () => {
      setReason("");
      await client.invalidateQueries();
      setSnackbar({
        severity: "success",
        message: "Entry action completed.",
      });
    },
  });
  const [snackbar, setSnackbar] = useState<{
    severity: "error" | "warning" | "success";
    message: string;
  } | null>(null);

  function askForReason(continuation: ReasonContinuation) {
    setReason("");
    setReasonDialogError("");
    setReasonContinuation(() => continuation);
    setReasonDialogOpen(true);
  }

  function closeReasonDialog() {
    if (update.isPending || action.isPending) return;
    setReasonDialogOpen(false);
    setReasonDialogError("");
    setReasonContinuation(null);
  }

  async function continueWithReason() {
    const changeReason = reason.trim();
    if (changeReason.length < 3) {
      setReasonDialogError("Please provide at least 3 characters.");
      return;
    }
    const continuation = reasonContinuation;
    setReasonDialogOpen(false);
    setReasonDialogError("");
    setReasonContinuation(null);
    if (continuation) await continuation(changeReason);
  }

  function save(data: Submission) {
    if (!formDirty && !imageDirty) return;
    if (reasonRequired) {
      askForReason((changeReason) => update.mutate({ data, changeReason }));
      return;
    }
    update.mutate({ data, changeReason: "" });
  }

  function performAction(actionName: string, changeReason: string) {
    action.mutate({
      action: actionName,
      changeReason: reasonRequired ? changeReason : "",
    });
  }

  function runAction(actionName: string, confirmation?: string) {
    if (confirmation && !window.confirm(confirmation)) return;
    if (reasonRequired) {
      askForReason((changeReason) => performAction(actionName, changeReason));
      return;
    }
    performAction(actionName, "");
  }

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
  const busy = update.isPending || action.isPending;
  const errorMessage = update.error?.message ?? action.error?.message;
  const hasChanges = formDirty || imageDirty;

  return (
    <Page
      title={"Manage " + listing.name}
      parent={{ label: "My entries", to: "/account/entries" }}
      account
      shareable={false}
    >
      <Stack spacing={2}>
        <Typography color="text.secondary">
          Revision {listing.version} ·{" "}
          {listing.status === "archived"
            ? "Hidden"
            : listing.status === "pending_review"
              ? "Pending publication"
              : "Published"}
        </Typography>
        <ListingForm
          key={listing.version}
          formId={EDIT_FORM_ID}
          hideSaveAction
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
          onSave={save}
          onDirtyChange={setFormDirty}
          pending={busy}
          disabled={busy || !permissions.data?.canEdit}
          error={update.error}
          imageContent={
            <ListingImagesEditor
              ref={imageEditorRef}
              listingId={id}
              images={listing.images}
              onDirtyChange={setImageDirty}
            />
          }
        />
      </Stack>

      <EntryActionsMenu
        listing={listing}
        userId={user.id}
        mode="edit"
        canEdit={!!permissions.data?.canEdit}
        canConfirm={!!permissions.data?.canConfirm}
        canReview={!!permissions.data?.canReview}
        canDelete={!!permissions.data?.canDelete}
        shareable={listing.status === "published"}
        permissionsPending={permissions.isPending}
        busy={busy}
        hasChanges={hasChanges}
        savePending={update.isPending}
        onSave={() => {
          const form = document.getElementById(EDIT_FORM_ID);
          if (form instanceof HTMLFormElement) form.requestSubmit();
        }}
        onAction={runAction}
        onDeleted={() => {
          const destination =
            user.role === "user" ? "/account/entries" : "/editor";
          navigate(destination, {
            state: {
              snackbar: {
                severity: "success",
                message: `“${listing.name}” was deleted.`,
              },
            },
          });
        }}
      />

      <Dialog
        open={reasonDialogOpen}
        onClose={closeReasonDialog}
        fullWidth
        maxWidth="sm"
        aria-labelledby="change-reason-title"
      >
        <DialogTitle id="change-reason-title">
          Reason for this change
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography>
              Because you are editing an entry you do not own, please explain
              why this change is being made. This reason is retained in the
              audit history.
            </Typography>
            <TextField
              autoFocus
              required
              label="Reason for change"
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
                setReasonDialogError("");
              }}
              error={!!reasonDialogError}
              helperText={
                reasonDialogError ||
                "At least 3 characters. Do not include personal information."
              }
              multiline
              minRows={2}
              slotProps={{ htmlInput: { maxLength: 500 } }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeReasonDialog} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={() => void continueWithReason()}
            disabled={busy}
          >
            Continue
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={!!errorMessage || !!snackbar}
        autoHideDuration={6000}
        onClose={() => {
          update.reset();
          action.reset();
          setSnackbar(null);
        }}
      >
        <Alert
          severity={errorMessage ? "error" : snackbar?.severity}
          onClose={() => {
            update.reset();
            action.reset();
            setSnackbar(null);
          }}
          variant="filled"
        >
          {errorMessage ?? snackbar?.message}
        </Alert>
      </Snackbar>
    </Page>
  );
}
