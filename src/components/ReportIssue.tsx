import { useId, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Alert,
  Box,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import FlagOutlined from "@mui/icons-material/FlagOutlined";
import Close from "@mui/icons-material/Close";
import SendOutlined from "@mui/icons-material/SendOutlined";
import { IconAction } from "./IconAction";
import { mutate } from "../lib/api";
import {
  REPORT_TEXT_LIMIT,
  reportReasons,
  reportReceiptSchema,
} from "../../shared/moderation";

/** Mount on a public listing: <ReportIssue listingId={entry.id} />. */
export function ReportIssue({ listingId }: { listingId: string }) {
  const titleId = useId();
  const warningId = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<keyof typeof reportReasons>("incorrect");
  const [text, setText] = useState("");
  const [website, setWebsite] = useState("");
  const report = useMutation({
    mutationFn: () =>
      mutate("/moderation/reports", reportReceiptSchema, {
        listingId,
        reason,
        text,
        website,
      }),
  });
  return (
    <>
      <IconAction
        label="Report an issue"
        onClick={() => {
          report.reset();
          setReason("incorrect");
          setText("");
          setWebsite("");
          setOpen(true);
        }}
      >
        <FlagOutlined />
      </IconAction>
      <Dialog
        open={open}
        onClose={() => {
          if (!report.isPending) setOpen(false);
        }}
        fullWidth
        maxWidth="sm"
        aria-labelledby={titleId}
        aria-describedby={warningId}
      >
        <Box
          component="form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!report.isPending && !report.isSuccess) report.mutate();
          }}
        >
          <DialogTitle id={titleId}>Report an issue</DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ pt: 1 }}>
              <Typography id={warningId}>
                No account is needed. Do not include names, email addresses,
                phone numbers, or other personal information. Reports are
                visible only to authorized staff.
              </Typography>
              {report.isSuccess ? (
                <Alert severity="success" role="status">
                  {report.data.message}
                </Alert>
              ) : (
                <>
                  <TextField
                    select
                    required
                    label="Reason"
                    value={reason}
                    onChange={(event) =>
                      setReason(
                        event.target.value as keyof typeof reportReasons,
                      )
                    }
                  >
                    {Object.entries(reportReasons).map(([value, label]) => (
                      <MenuItem key={value} value={value}>
                        {label}
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField
                    label="Short details (optional)"
                    multiline
                    minRows={3}
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                    slotProps={{ htmlInput: { maxLength: REPORT_TEXT_LIMIT } }}
                    helperText={`${text.length}/${REPORT_TEXT_LIMIT} characters. Describe the entry issue only.`}
                  />
                  <Box aria-hidden="true" sx={{ display: "none" }}>
                    <TextField
                      label="Leave this field empty"
                      name="website"
                      value={website}
                      onChange={(event) => setWebsite(event.target.value)}
                      autoComplete="off"
                      slotProps={{
                        htmlInput: { tabIndex: -1, maxLength: 1000 },
                      }}
                    />
                  </Box>
                  {report.error && (
                    <Alert severity="error">{report.error.message}</Alert>
                  )}
                </>
              )}
            </Stack>
          </DialogContent>
          <DialogActions>
            <IconAction
              label="Close report dialog"
              disabled={report.isPending}
              onClick={() => setOpen(false)}
            >
              <Close />
            </IconAction>
            {!report.isSuccess && (
              <IconAction
                label="Send report"
                type="submit"
                disabled={report.isPending}
              >
                <SendOutlined />
              </IconAction>
            )}
          </DialogActions>
        </Box>
      </Dialog>
    </>
  );
}
