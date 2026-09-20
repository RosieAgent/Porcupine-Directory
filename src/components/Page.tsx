import { useEffect } from "react";
import type { ReactNode } from "react";
import {
  Alert,
  Box,
  Breadcrumbs,
  CircularProgress,
  Link,
  Stack,
  Typography,
} from "@mui/material";
import { Link as RouterLink } from "react-router";
import { ApiError } from "../lib/api";
import { ShareButton } from "./ShareButton";
import { IconAction } from "./IconAction";
import Refresh from "@mui/icons-material/Refresh";

export function Page({
  title,
  description,
  children,
  parent,
  shareable = true,
  actions,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  parent?: { label: string; to: string };
  shareable?: boolean;
  actions?: ReactNode;
}) {
  useEffect(() => {
    document.title = title + " · Porcupine Directory";
  }, [title]);
  return (
    <Stack spacing={3}>
      <Stack
        direction="row"
        spacing={2}
        data-testid="page-toolbar"
        sx={{
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
        }}
      >
        <Breadcrumbs
          aria-label="Breadcrumb"
          sx={{ minWidth: 0, flex: 1, overflowWrap: "anywhere" }}
        >
          <Link component={RouterLink} to="/">
            Home
          </Link>
          {parent && (
            <Link component={RouterLink} to={parent.to}>
              {parent.label}
            </Link>
          )}
          <Typography color="text.primary">{title}</Typography>
        </Breadcrumbs>
        <Stack
          direction="row"
          spacing={0.5}
          data-testid="page-actions"
          sx={{ alignItems: "center", flexShrink: 0, ml: "auto" }}
        >
          {shareable && <ShareButton />}
          {actions}
        </Stack>
      </Stack>
      <Box>
        <Typography
          variant="h1"
          sx={{ fontSize: { xs: "2rem", md: "2.8rem" } }}
        >
          {title}
        </Typography>
        {description && (
          <Typography color="text.secondary" sx={{ mt: 1, maxWidth: 760 }}>
            {description}
          </Typography>
        )}
      </Box>
      {children}
    </Stack>
  );
}
export function Loading() {
  return (
    <Stack
      direction="row"
      spacing={2}
      sx={{ alignItems: "center" }}
      role="status"
    >
      <CircularProgress size={24} />
      <Typography>Loading…</Typography>
    </Stack>
  );
}
export function ErrorState({
  error,
  retry,
}: {
  error: Error;
  retry?: () => void;
}) {
  return (
    <Alert
      severity="error"
      action={
        retry && (
          <IconAction label="Retry" color="inherit" onClick={retry}>
            <Refresh />
          </IconAction>
        )
      }
    >
      {error instanceof ApiError && error.status === 404
        ? "This entry is unavailable or has not been published."
        : error.message}
    </Alert>
  );
}
export function Empty({ message }: { message: string }) {
  return <Alert severity="info">{message}</Alert>;
}
