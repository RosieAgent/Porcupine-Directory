import { useEffect, useState } from "react";
import { z } from "zod";
import { useLocation, useNavigate } from "react-router";
import { Alert, Paper, Stack, TextField } from "@mui/material";
import PersonAddOutlined from "@mui/icons-material/PersonAddOutlined";
import { useMutation } from "@tanstack/react-query";
import {
  activationSchema,
  recoveryResponse,
  confirmedPasswordSchema,
} from "../../shared/auth";
import { ConfirmPasswordField } from "../components/ConfirmPasswordField";
import { Page } from "../components/Page";
import { IconAction } from "../components/IconAction";
import { mutate } from "../lib/api";
import { useAuth } from "../state/AuthProvider";
import { RecoveryPhrase } from "./AccountPages";

export default function ActivatePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [token, setToken] = useState(
    () => new URLSearchParams(location.hash.slice(1)).get("token") ?? "",
  );
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [phrase, setPhrase] = useState("");
  useEffect(() => {
    if (location.hash) void navigate("/activate", { replace: true });
  }, [location.hash, navigate]);
  const activate = useMutation({
    mutationFn: async () => {
      confirmedPasswordSchema.parse({ password, confirmation });
      const result = await mutate(
        "/auth/activate",
        recoveryResponse,
        activationSchema.parse({ token, password }),
      );
      setToken("");
      setPassword("");
      setConfirmation("");
      setPhrase(result.phrase);
      await refresh();
    },
  });
  return (
    <Page title="Set up your account" shareable={false}>
      {phrase ? (
        <RecoveryPhrase
          phrase={phrase}
          onDone={() => void navigate("/account/security")}
        />
      ) : (
        <Paper
          component="form"
          variant="outlined"
          sx={{ p: 3, maxWidth: 560 }}
          onSubmit={(event) => {
            event.preventDefault();
            activate.mutate();
          }}
        >
          <Stack spacing={2}>
            <Alert severity="info">
              Choose your own password, then save your recovery phrase. Setup
              invitations expire after 24 hours and work only once.
            </Alert>
            <TextField
              label="Setup code"
              type="password"
              required
              value={token}
              onChange={(event) => setToken(event.target.value)}
              autoComplete="off"
            />
            <TextField
              label="New password"
              type="password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              helperText="At least 15 characters. Punctuation is welcome."
            />
            <ConfirmPasswordField
              password={password}
              value={confirmation}
              onChange={setConfirmation}
            />
            {activate.error && (
              <Alert severity="error">
                {activate.error instanceof z.ZodError
                  ? activate.error.issues[0].message
                  : activate.error.message}
              </Alert>
            )}
            <IconAction
              label="Activate account"
              type="submit"
              disabled={activate.isPending}
            >
              <PersonAddOutlined />
            </IconAction>
          </Stack>
        </Paper>
      )}
    </Page>
  );
}
