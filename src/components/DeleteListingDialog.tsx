import { useState } from "react";
import type { ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import DeleteForeverOutlined from "@mui/icons-material/DeleteForeverOutlined";
import { okSchema } from "../../shared/auth";
import { mutate } from "../lib/api";

export function DeleteListingDialog({
  listingId,
  listingName,
  disabled = false,
  trigger,
  open: controlledOpen,
  onOpenChange,
  onError,
  onDeleted,
}: {
  listingId: string;
  listingName: string;
  disabled?: boolean;
  trigger?: (open: () => void) => ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onError?: (error: Error) => void;
  onDeleted: () => void | Promise<void>;
}) {
  const client = useQueryClient();
  const [internalOpen, setInternalOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [reason, setReason] = useState("");
  const open = controlledOpen ?? internalOpen;
  const setOpen = (nextOpen: boolean) => {
    if (controlledOpen === undefined) setInternalOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };
  const remove = useMutation({
    mutationFn: () =>
      mutate(
        `/listings/${listingId}`,
        okSchema,
        { confirmation, reason },
        "DELETE",
      ),
    onSuccess: async () => {
      setOpen(false);
      setConfirmation("");
      setReason("");
      client.removeQueries({ queryKey: ["listing", listingId] });
      client.removeQueries({ queryKey: ["listings"] });
      await client.invalidateQueries({ queryKey: ["private", "entries"] });
      await onDeleted();
    },
    onError,
  });
  const close = () => {
    if (!remove.isPending) {
      setOpen(false);
      remove.reset();
    }
  };
  const ready =
    confirmation.trim() === listingName && reason.trim().length >= 3;
  const openDialog = () => {
    remove.reset();
    setOpen(true);
  };
  return (
    <>
      {trigger ? (
        trigger(openDialog)
      ) : (
        <Button
          color="error"
          variant="outlined"
          startIcon={<DeleteForeverOutlined />}
          disabled={disabled}
          onClick={openDialog}
        >
          Delete entry
        </Button>
      )}
      <Dialog
        open={open}
        onClose={close}
        fullWidth
        maxWidth="sm"
        aria-labelledby="delete-listing-title"
      >
        <DialogTitle id="delete-listing-title">
          Permanently delete “{listingName}”?
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Alert severity="warning">
              This permanently removes the entry from the directory, along with
              its images and saved copies. It cannot be undone from the
              application. Private audit records are retained.
            </Alert>
            <Typography variant="body2">
              If you only want to take it out of public browsing, cancel this
              dialog and use Hide/Remove from directory instead. That action is
              reversible by a monitor or administrator.
            </Typography>
            <TextField
              label="Type the entry name exactly to confirm"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              helperText={listingName}
              autoComplete="off"
              slotProps={{ htmlInput: { maxLength: 160 } }}
            />
            <TextField
              label="Reason for deletion"
              required
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              helperText="At least 3 characters. This reason is kept in the private audit log."
              multiline
              minRows={2}
              slotProps={{ htmlInput: { maxLength: 500 } }}
            />
            {remove.error && (
              <Alert severity="error">{remove.error.message}</Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={close} disabled={remove.isPending}>
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            startIcon={<DeleteForeverOutlined />}
            disabled={!ready || remove.isPending}
            onClick={() => remove.mutate()}
          >
            Delete permanently
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
