import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Alert, Paper, Stack, TextField, Typography } from "@mui/material";
import VerifiedUserOutlined from "@mui/icons-material/VerifiedUserOutlined";
import { Link } from "react-router";
import { useAuth } from "../state/AuthProvider";
import { IconAction } from "./IconAction";
import { mutate } from "../lib/api";
import { okSchema } from "../../shared/auth";

export function StaffVerification() {
  const { user, refresh, staffAuthMode, passkeysEnabled } = useAuth();
  const [password, setPassword] = useState("");
  const verify = useMutation({
    mutationFn: async () => {
      try {
        await mutate("/auth/reauthenticate", okSchema, { password });
        await refresh();
      } finally {
        setPassword("");
      }
    },
  });
  if (!user || user.role === "user") return null;
  if (user.privilegesSuspended)
    return (
      <Alert severity="warning">
        Staff access is suspended after recovery. Save the new recovery phrase
        and request role reapproval; password verification alone cannot restore
        privileges.
      </Alert>
    );
  if (!user.recoverySaved)
    return (
      <Alert severity="warning">
        Save your recovery phrase before using staff actions.{" "}
        <Link to="/account/security">Account security</Link>
      </Alert>
    );
  if (staffAuthMode === "session") return null;
  if (staffAuthMode !== "password_recent")
    return (
      <Alert severity="info">
        {passkeysEnabled
          ? "Verify your passkey in Account security for staff actions."
          : "Staff verification is unavailable until the authentication policy is configured."}{" "}
        <Link to="/account/security">Account security</Link>
      </Alert>
    );
  return (
    <Paper
      component="form"
      variant="outlined"
      sx={{ p: 2, maxWidth: 650 }}
      onSubmit={(event) => {
        event.preventDefault();
        verify.mutate();
      }}
    >
      <Stack spacing={2}>
        <Typography variant="body2">
          {user.staffVerified
            ? "Password verified for staff actions. "
            : "Verify your password to use staff actions. "}
          Verification lasts 15 minutes; account-security changes require
          verification within five minutes.
        </Typography>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <TextField
            fullWidth
            label="Current password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <IconAction
            label="Verify password"
            type="submit"
            disabled={verify.isPending}
          >
            <VerifiedUserOutlined />
          </IconAction>
        </Stack>
        {verify.error && <Alert severity="error">{verify.error.message}</Alert>}
        {verify.isSuccess && (
          <Typography role="status">Password verified.</Typography>
        )}
      </Stack>
    </Paper>
  );
}
