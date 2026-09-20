import { Alert, Badge, CircularProgress, Snackbar, Stack } from "@mui/material";
import AccountCircle from "@mui/icons-material/AccountCircle";
import Login from "@mui/icons-material/Login";
import Logout from "@mui/icons-material/Logout";
import Refresh from "@mui/icons-material/Refresh";
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "../state/AuthProvider";
import { IconAction, IconLink } from "./IconAction";

export function HeaderAccountActions() {
  const { user, loading, error, logout, refresh } = useAuth();
  const exit = useMutation({ mutationFn: logout });
  const retry = useMutation({ mutationFn: refresh });
  return (
    <Stack
      direction="row"
      role="group"
      aria-label={
        loading
          ? "Checking sign-in status"
          : error
            ? "Sign-in status unavailable"
            : user
              ? "Signed in"
              : "Signed out"
      }
      sx={{ alignItems: "center", gap: 0.5, minHeight: 44 }}
    >
      {loading ? (
        <CircularProgress size={24} aria-label="Checking sign-in status" />
      ) : error ? (
        <IconAction
          label="Sign-in status unavailable — retry"
          onClick={() => retry.mutate()}
          disabled={retry.isPending}
        >
          <Refresh />
        </IconAction>
      ) : user ? (
        <>
          <IconLink to="/account" label="Your account">
            <Badge variant="dot" color="success">
              <AccountCircle />
            </Badge>
          </IconLink>
          <IconAction
            label="Sign out"
            onClick={() => exit.mutate()}
            disabled={exit.isPending}
          >
            <Logout />
          </IconAction>
        </>
      ) : (
        <IconLink to="/login" label="Sign in">
          <Login />
        </IconLink>
      )}
      <Snackbar open={!!exit.error} onClose={() => exit.reset()}>
        <Alert severity="error" onClose={() => exit.reset()}>
          Could not complete sign-out. Please try again.
        </Alert>
      </Snackbar>
    </Stack>
  );
}
