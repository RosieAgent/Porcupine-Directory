import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Alert, Paper, Stack, TextField, Typography } from "@mui/material";
import { z } from "zod";
import SendOutlined from "@mui/icons-material/SendOutlined";
import Check from "@mui/icons-material/Check";
import DeleteOutline from "@mui/icons-material/DeleteOutlined";
import { IconAction } from "./IconAction";
import { request, mutate } from "../lib/api";
import { okSchema } from "../../shared/auth";
import { useAuth } from "../state/AuthProvider";
export function EmailSettings() {
  const { emailRecoveryEnabled, emailPreviewEnabled, user } = useAuth();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const status = useQuery({
    queryKey: ["private", "email", user?.id],
    queryFn: () =>
      request(
        "/auth/email/status",
        z.object({ verified: z.boolean(), pending: z.boolean() }),
      ),
    enabled: emailRecoveryEnabled,
  });
  const action = useMutation({
    mutationFn: async (kind: "setup" | "verify" | "remove") => {
      await mutate(
        kind === "remove" ? "/auth/email/" : "/auth/email/" + kind,
        okSchema,
        kind === "setup" ? { email } : { code },
        kind === "remove" ? "DELETE" : "POST",
      );
      setEmail("");
      setCode("");
    },
    onSettled: async () => {
      await status.refetch();
    },
  });
  if (!emailRecoveryEnabled)
    return (
      <Alert severity="info">
        Optional email recovery is not configured. Your recovery phrase works
        without email.
      </Alert>
    );
  return (
    <Paper variant="outlined" sx={{ p: 3 }}>
      <Stack spacing={2}>
        <Typography variant="h2">Optional recovery email</Typography>
        {emailPreviewEnabled && (
          <Alert severity="warning">
            Local preview only: messages go to this machine’s test inbox, not
            your email provider. Anyone with access to that inbox can read
            recovery codes. Use a test address; this is not a production
            recovery service.
          </Alert>
        )}
        <Typography>
          Recovery phrases are the more private option. Email recovery stores an
          encrypted address and involves your email provider. Only a verified
          address can recover this account.
        </Typography>
        <Typography>
          {status.data?.verified
            ? "A verified recovery email is enabled."
            : "No verified recovery email."}
        </Typography>
        <TextField
          label="Recovery email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
        <IconAction
          label="Send email verification code"
          disabled={action.isPending || !email}
          onClick={() => action.mutate("setup")}
        >
          <SendOutlined />
        </IconAction>
        {status.data?.pending && (
          <>
            <TextField
              label="Email verification code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoComplete="off"
            />
            <IconAction
              label="Verify recovery email"
              disabled={action.isPending || !code}
              onClick={() => action.mutate("verify")}
            >
              <Check />
            </IconAction>
          </>
        )}
        <IconAction
          label="Remove recovery email and pending codes"
          disabled={action.isPending}
          onClick={() => {
            if (
              window.confirm(
                "Remove email recovery? Keep your recovery phrase safe.",
              )
            )
              action.mutate("remove");
          }}
        >
          <DeleteOutline />
        </IconAction>
        {(action.error || status.error) && (
          <Alert severity="error">
            {(action.error || status.error)?.message}
          </Alert>
        )}
        {action.isSuccess && (
          <Alert severity="success">Recovery email settings updated.</Alert>
        )}
      </Stack>
    </Paper>
  );
}
