import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
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
  onDeleted,
}: {
  listingId: string;
  listingName: string;
  disabled?: boolean;
  onDeleted: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [reason, setReason] = useState("");
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
      await onDeleted();
    },
  });
  const close = () => {
    if (!remove.isPending) {
      setOpen(false);
      remove.reset();
    }
  };
  const ready =
    confirmation.trim() === listingName && reason.trim().length >= 3;
  return (
    <>
      <Button
        color="error"
        variant="outlined"
        startIcon={<DeleteForeverOutlined />}
        disabled={disabled}
        onClick={() => {
          remove.reset();
          setOpen(true);
        }}
      >
        Delete entry
      </Button>
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
              its revision history, ownership assignments, moderation records,
              and saved copies. It cannot be undone from the application.
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
