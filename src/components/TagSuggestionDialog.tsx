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
import AddOutlined from "@mui/icons-material/AddOutlined";
import {
  tagSuggestionInputSchema,
  tagSuggestionResponse,
} from "../../shared/tags";
import { mutate } from "../lib/api";

export function TagSuggestionDialog({
  listingName = "",
}: {
  listingName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState("");
  const suggestion = useMutation({
    mutationFn: () =>
      mutate(
        "/tags/suggestions",
        tagSuggestionResponse,
        tagSuggestionInputSchema.parse({ name, reason, listingName }),
      ),
    onSuccess: () => {
      setOpen(false);
      setName("");
      setReason("");
      setNotice("Thanks. A monitor will review this tag suggestion.");
    },
  });
  const valid =
    name.trim().length >= 2 &&
    reason.trim().length >= 3 &&
    !suggestion.isPending;
  return (
    <>
      {notice && <Alert severity="success">{notice}</Alert>}
      <Stack spacing={0.5}>
        <Typography variant="body2" color="text.secondary">
          Cannot find the topic you need?
        </Typography>
        <Button
          type="button"
          variant="text"
          startIcon={<AddOutlined />}
          onClick={() => {
            suggestion.reset();
            setNotice("");
            setOpen(true);
          }}
          sx={{ alignSelf: "flex-start" }}
        >
          Suggest a new tag
        </Button>
      </Stack>
      <Dialog
        open={open}
        onClose={() => !suggestion.isPending && setOpen(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Suggest a new tag</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Suggestions are reviewed by a monitor or administrator before they
              appear in the directory. This does not add the tag to the entry
              yet.
            </Typography>
            <TextField
              label="Suggested tag"
              required
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              helperText="For example: Animal"
              slotProps={{ htmlInput: { maxLength: 80 } }}
            />
            <TextField
              label="Why would this tag help?"
              required
              multiline
              minRows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              helperText="Give the reviewer a little context."
              slotProps={{ htmlInput: { maxLength: 500 } }}
            />
            {suggestion.error && (
              <Alert severity="error">{suggestion.error.message}</Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setOpen(false)}
            disabled={suggestion.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={() => suggestion.mutate()}
            disabled={!valid}
          >
            Send suggestion
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
