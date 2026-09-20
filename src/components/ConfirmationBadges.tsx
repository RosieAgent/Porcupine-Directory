import { Stack, Tooltip } from "@mui/material";
import HelpOutline from "@mui/icons-material/HelpOutlined";
import PersonOutlined from "@mui/icons-material/HowToRegOutlined";
import FactCheckOutlined from "@mui/icons-material/FactCheckOutlined";
import HistoryOutlined from "@mui/icons-material/HistoryOutlined";
import {
  isFreshConfirmation,
  confirmationDate,
  CONFIRMATION_FRESH_DAYS,
} from "../../shared/trust";
import type { Listing } from "../../shared/contracts";
export function ConfirmationBadges({ listing }: { listing: Listing }) {
  const self = listing.selfConfirmedAt;
  const reviewed = listing.editorReviewedAt;
  return (
    <Stack direction="row" spacing={1}>
      {!self && !reviewed && (
        <Tooltip title="Unconfirmed — this information has not been confirmed or editor-reviewed">
          <span role="img" aria-label="Unconfirmed" tabIndex={0}>
            <HelpOutline color="warning" fontSize="small" />
          </span>
        </Tooltip>
      )}
      {self && (
        <Tooltip
          title={
            "Self-confirmed by the entry owner on " +
            confirmationDate(self) +
            (isFreshConfirmation(self)
              ? " — recent owner confirmation"
              : ` — needs rechecking; no ordering boost after ${CONFIRMATION_FRESH_DAYS} days`)
          }
        >
          <span
            role="img"
            aria-label={
              isFreshConfirmation(self)
                ? "Self-confirmed"
                : "Self-confirmation needs rechecking"
            }
            tabIndex={0}
          >
            {isFreshConfirmation(self) ? (
              <PersonOutlined color="info" fontSize="small" />
            ) : (
              <HistoryOutlined color="warning" fontSize="small" />
            )}
          </span>
        </Tooltip>
      )}
      {reviewed && (
        <Tooltip
          title={
            "Editor-reviewed on " +
            confirmationDate(reviewed) +
            (isFreshConfirmation(reviewed)
              ? ""
              : ` — needs rechecking; no ordering boost after ${CONFIRMATION_FRESH_DAYS} days`) +
            " — not a guarantee of accuracy"
          }
        >
          <span
            role="img"
            aria-label={
              isFreshConfirmation(reviewed)
                ? "Editor-reviewed"
                : "Editor review needs rechecking"
            }
            tabIndex={0}
          >
            {isFreshConfirmation(reviewed) ? (
              <FactCheckOutlined color="success" fontSize="small" />
            ) : (
              <HistoryOutlined color="warning" fontSize="small" />
            )}
          </span>
        </Tooltip>
      )}
    </Stack>
  );
}
