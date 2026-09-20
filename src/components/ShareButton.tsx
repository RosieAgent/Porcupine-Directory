import { useState } from "react";
import {
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Snackbar,
  TextField,
} from "@mui/material";
import ShareOutlined from "@mui/icons-material/ShareOutlined";
import Close from "@mui/icons-material/Close";
import { useLocation } from "react-router";
import { IconAction } from "./IconAction";

const browsePaths = new Set([
  "/directory",
  "/groups",
  "/channels",
  "/businesses",
  "/resources",
  "/organizations",
  "/events",
  "/events/calendar",
  "/tags",
]);
const publicPaths = new Set([
  "/",
  "/about",
  "/donate",
  "/submit",
  "/events/add",
]);
const publicFilters = new Set([
  "q",
  "kind",
  "access",
  "tag",
  "tags",
  "location",
  "sort",
  "lifecycle",
  "needs",
  "connection",
  "view",
  "page",
  "pageSize",
  "from",
  "to",
  "month",
]);

export function ShareButton() {
  const [copied, setCopied] = useState(false);
  const [fallback, setFallback] = useState(false);
  const location = useLocation();
  const path = location.pathname;
  const isDetail =
    /^\/(listings|events)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/?$/i.test(
      path,
    );
  if (!browsePaths.has(path) && !publicPaths.has(path) && !isDetail)
    return null;
  const url = new URL(path, window.location.origin);
  if (browsePaths.has(path)) {
    for (const [key, value] of new URLSearchParams(location.search)) {
      if (publicFilters.has(key)) url.searchParams.append(key, value);
    }
  }
  const shareUrl = url.href;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
    } catch {
      setFallback(true);
    }
  };
  return (
    <>
      <IconAction label="Copy link" onClick={() => void copy()}>
        <ShareOutlined data-share-icon="true" />
      </IconAction>
      <Snackbar
        open={copied}
        autoHideDuration={3000}
        onClose={() => setCopied(false)}
        message="Link copied"
      />
      <Dialog open={fallback} onClose={() => setFallback(false)} fullWidth>
        <DialogTitle>Copy this page’s link</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Shareable URL"
            value={shareUrl}
            autoFocus
            slotProps={{ input: { readOnly: true } }}
            onFocus={(event) => event.target.select()}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <IconAction
            label="Close link dialog"
            onClick={() => setFallback(false)}
          >
            <Close />
          </IconAction>
        </DialogActions>
      </Dialog>
    </>
  );
}
