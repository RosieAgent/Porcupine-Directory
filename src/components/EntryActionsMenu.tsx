import type { ReactNode } from "react";
import { useState } from "react";
import {
  Badge,
  Box,
  Divider,
  Fab,
  Alert,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Snackbar,
  Tooltip,
} from "@mui/material";
import Check from "@mui/icons-material/Check";
import DeleteForeverOutlined from "@mui/icons-material/DeleteForeverOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import FactCheckOutlined from "@mui/icons-material/FactCheckOutlined";
import FlagOutlined from "@mui/icons-material/FlagOutlined";
import HistoryOutlined from "@mui/icons-material/HistoryOutlined";
import MoreVert from "@mui/icons-material/MoreVert";
import PersonAddOutlined from "@mui/icons-material/PersonAddOutlined";
import Bookmark from "@mui/icons-material/Bookmark";
import BookmarkBorder from "@mui/icons-material/BookmarkBorder";
import SaveOutlined from "@mui/icons-material/SaveOutlined";
import ShareOutlined from "@mui/icons-material/ShareOutlined";
import VisibilityOutlined from "@mui/icons-material/VisibilityOutlined";
import VisibilityOffOutlined from "@mui/icons-material/VisibilityOffOutlined";
import { Link } from "react-router";
import type { Listing } from "../../shared/contracts";
import { DeleteListingDialog } from "./DeleteListingDialog";
import { OwnershipAssignment } from "./OwnershipAssignment";
import { ReportIssue } from "./ReportIssue";
import { SaveButton } from "./ListingCard";
import { ShareButton } from "./ShareButton";

type EntryActionsMenuProps = {
  listing: Pick<Listing, "id" | "name" | "version" | "status">;
  userId: string;
  mode: "edit" | "view";
  canEdit: boolean;
  canConfirm: boolean;
  canReview: boolean;
  canDelete: boolean;
  shareable?: boolean;
  permissionsPending?: boolean;
  busy?: boolean;
  hasChanges?: boolean;
  savePending?: boolean;
  onSave?: () => void;
  onAction?: (action: string, confirmation?: string) => void;
  onDeleted: () => void | Promise<void>;
};

export function EntryActionsMenu({
  listing,
  userId,
  mode,
  canEdit,
  canConfirm,
  canReview,
  canDelete,
  shareable = true,
  permissionsPending = false,
  busy = false,
  hasChanges = false,
  savePending = false,
  onSave,
  onAction,
  onDeleted,
}: EntryActionsMenuProps) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [notice, setNotice] = useState<{
    severity: "error" | "success";
    message: string;
  } | null>(null);
  const open = Boolean(anchorEl);
  const close = () => setAnchorEl(null);
  const showStaffActions = mode === "edit";
  const editHref = `/listings/${listing.id}/edit`;
  const historyHref = `/listings/${listing.id}/history`;

  return (
    <>
      <Box
        sx={{
          position: "fixed",
          top: { xs: 144, sm: 96 },
          right: { xs: 12, sm: 24 },
          zIndex: (theme) => theme.zIndex.modal - 1,
        }}
      >
        <Tooltip
          title={
            mode === "edit" && hasChanges
              ? "Entry actions — unsaved changes. Open to save."
              : "Entry actions"
          }
          describeChild
        >
          <Badge
            color="warning"
            variant="dot"
            overlap="circular"
            invisible={mode !== "edit" || !hasChanges}
          >
            <Fab
              id="entry-actions-button"
              color={mode === "edit" && hasChanges ? "warning" : "primary"}
              size="medium"
              aria-label={
                mode === "edit" && hasChanges
                  ? "Entry actions, unsaved changes"
                  : "Entry actions"
              }
              aria-controls={open ? "entry-actions-menu" : undefined}
              aria-expanded={open ? "true" : undefined}
              aria-haspopup="menu"
              onClick={(event) => setAnchorEl(event.currentTarget)}
              sx={
                mode === "edit" && hasChanges
                  ? {
                      animation: "entry-actions-pulse 1.8s ease-in-out infinite",
                      "@keyframes entry-actions-pulse": {
                        "0%, 100%": { boxShadow: 6 },
                        "50%": { boxShadow: 12 },
                      },
                    }
                  : undefined
              }
            >
              {mode === "edit" && hasChanges ? <SaveOutlined /> : <MoreVert />}
            </Fab>
          </Badge>
        </Tooltip>
        <Menu
          id="entry-actions-menu"
          anchorEl={anchorEl}
          open={open}
          onClose={close}
          slotProps={{ list: { "aria-labelledby": "entry-actions-button" } }}
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
          transformOrigin={{ vertical: "top", horizontal: "right" }}
        >
        {mode === "view" && (
          <>
            <SaveButton
              listing={listing}
              trigger={(toggle, saved, savedBusy) => (
                <MenuItem
                  disabled={savedBusy}
                  onClick={() => {
                    close();
                    void toggle()
                      .then((nextSaved) => {
                        setNotice({
                          severity: "success",
                          message: nextSaved
                            ? "Entry bookmarked."
                            : "Bookmark removed.",
                        });
                      })
                      .catch((error: unknown) => {
                        setNotice({
                          severity: "error",
                          message:
                            error instanceof Error
                              ? error.message
                              : "Unable to update the bookmark.",
                        });
                      });
                  }}
                >
                  <ListItemIcon>
                    {saved ? (
                      <Bookmark fontSize="small" />
                    ) : (
                      <BookmarkBorder fontSize="small" />
                    )}
                  </ListItemIcon>
                  <ListItemText
                    primary={saved ? "Remove bookmark" : "Bookmark"}
                  />
                </MenuItem>
              )}
            />
            <MenuItem
              onClick={() => {
                close();
                setReportDialogOpen(true);
              }}
            >
              <ListItemIcon>
                <FlagOutlined fontSize="small" />
              </ListItemIcon>
              <ListItemText primary="Report an issue" />
            </MenuItem>
          </>
        )}
        {shareable && (
          <ShareButton
            pathOverride={`/listings/${listing.id}`}
            trigger={(copy) => (
              <MenuItem
                onClick={() => {
                  close();
                  void copy();
                }}
              >
                <ListItemIcon>
                  <ShareOutlined fontSize="small" />
                </ListItemIcon>
                <ListItemText primary="Share Link" />
              </MenuItem>
            )}
          />
        )}
        {mode === "view" && <Divider />}
        {(mode === "edit" || canEdit) && (
          <MenuItem
            component={Link}
            to={mode === "edit" ? `/listings/${listing.id}` : editHref}
            onClick={close}
          >
            <ListItemIcon>
              <EditOutlined fontSize="small" />
            </ListItemIcon>
            <ListItemText
              primary={mode === "edit" ? "View entry" : "Edit entry"}
            />
          </MenuItem>
        )}
        {showStaffActions && canConfirm && (
          <>
            <Divider />
            <ActionItem
              disabled={busy}
              icon={<Check fontSize="small" />}
              label="Confirm accuracy"
              onClick={() => {
                close();
                onAction?.(
                  "confirm",
                  "Confirm that you reviewed the currently saved entry and believe it is accurate?",
                );
              }}
            />
            {listing.status !== "archived" && (
              <ActionItem
                disabled={busy}
                icon={<VisibilityOffOutlined fontSize="small" />}
                label="Remove from directory"
                onClick={() => {
                  close();
                  onAction?.(
                    "hide",
                    "Remove this entry from public browsing? It can be restored by a monitor or administrator.",
                  );
                }}
              />
            )}
          </>
        )}
        {showStaffActions && canReview && (
          <>
            <Divider />
            <ActionItem
              disabled={busy}
              icon={<FactCheckOutlined fontSize="small" />}
              label="Mark editor-reviewed"
              onClick={() => {
                close();
                onAction?.(
                  "review",
                  "Mark the currently saved entry as editor-reviewed?",
                );
              }}
            />
            <ActionItem
              disabled={busy}
              icon={
                listing.status === "published" ? (
                  <VisibilityOffOutlined fontSize="small" />
                ) : (
                  <VisibilityOutlined fontSize="small" />
                )
              }
              label={listing.status === "published" ? "Hide entry" : "Publish entry"}
              onClick={() => {
                close();
                onAction?.(
                  listing.status === "published" ? "hide" : "publish",
                  listing.status === "published"
                    ? "Hide this entry from public browsing?"
                    : "Publish this entry?",
                );
              }}
            />
            <OwnershipAssignment
              key={listing.id + ":" + userId}
              listingId={listing.id}
              version={listing.version}
              trigger={(openAssignment) => (
                <MenuItem
                  disabled={busy}
                  onClick={() => {
                    close();
                    openAssignment();
                  }}
                >
                  <ListItemIcon>
                    <PersonAddOutlined fontSize="small" />
                  </ListItemIcon>
                  <ListItemText primary="Assign owner" />
                </MenuItem>
              )}
            />
            <MenuItem
              component={Link}
              to={historyHref}
              onClick={close}
            >
              <ListItemIcon>
                <HistoryOutlined fontSize="small" />
              </ListItemIcon>
              <ListItemText primary="Revision history" />
            </MenuItem>
          </>
        )}
        {mode === "edit" && onSave && (
          <>
            <Divider />
            <Tooltip title={!hasChanges ? "No changes detected" : ""}>
              <span>
                <MenuItem
                  disabled={
                    busy ||
                    permissionsPending ||
                    !canEdit ||
                    !hasChanges
                  }
                  onClick={() => {
                    close();
                    onSave();
                  }}
                >
                  <ListItemIcon>
                    <SaveOutlined fontSize="small" />
                  </ListItemIcon>
                  <ListItemText
                    primary={savePending ? "Saving…" : "Save changes"}
                    secondary={!hasChanges ? "No changes detected" : undefined}
                  />
                </MenuItem>
              </span>
            </Tooltip>
          </>
        )}
        {canDelete && (
          <>
            <Divider />
            <MenuItem
              disabled={busy}
              onClick={() => {
                close();
                setDeleteDialogOpen(true);
              }}
            >
              <ListItemIcon>
                <DeleteForeverOutlined fontSize="small" />
              </ListItemIcon>
              <ListItemText primary="Delete entry" />
            </MenuItem>
          </>
        )}
        </Menu>
        {canDelete && (
          <DeleteListingDialog
            key={listing.id + ":" + (deleteDialogOpen ? "open" : "closed")}
            listingId={listing.id}
            listingName={listing.name}
            trigger={() => null}
            open={deleteDialogOpen}
            onOpenChange={setDeleteDialogOpen}
            onError={(error) =>
              setNotice({
                severity: "error",
                message: "Delete failed: " + error.message,
              })
            }
            onDeleted={onDeleted}
          />
        )}
        {mode === "view" && (
          <ReportIssue
            key={listing.id + ":" + (reportDialogOpen ? "open" : "closed")}
            listingId={listing.id}
            trigger={() => null}
            open={reportDialogOpen}
            onOpenChange={setReportDialogOpen}
          />
        )}
        <Snackbar
          open={!!notice}
          autoHideDuration={5000}
          onClose={() => setNotice(null)}
        >
          <Alert
            severity={notice?.severity}
            variant="filled"
            onClose={() => setNotice(null)}
          >
            {notice?.message}
          </Alert>
        </Snackbar>
      </Box>
    </>
  );
}

function ActionItem({
  disabled,
  icon,
  label,
  onClick,
}: {
  disabled: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <MenuItem disabled={disabled} onClick={onClick}>
      <ListItemIcon>{icon}</ListItemIcon>
      <ListItemText primary={label} />
    </MenuItem>
  );
}
