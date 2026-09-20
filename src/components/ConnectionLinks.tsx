import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Link,
  Stack,
  SvgIcon,
  Tooltip,
  Typography,
} from "@mui/material";
import ExpandMore from "@mui/icons-material/ExpandMore";
import LanguageOutlined from "@mui/icons-material/LanguageOutlined";
import LinkOutlined from "@mui/icons-material/LinkOutlined";
import {
  siSignal,
  siTelegram,
  siDiscord,
  siFacebook,
  siInstagram,
  siYoutube,
  siX,
} from "simple-icons";
import HubOutlined from "@mui/icons-material/HubOutlined";
import {
  connectionLabels,
  connectionText,
  groupConnections,
} from "../../shared/connections";
import type { Connection, ConnectionType } from "../../shared/connections";
const brands = {
  signal: siSignal,
  telegram: siTelegram,
  discord: siDiscord,
  facebook: siFacebook,
  instagram: siInstagram,
  youtube: siYoutube,
  x: siX,
};
function ConnectionIcon({ type }: { type: ConnectionType }) {
  if (type === "website") return <LanguageOutlined />;
  if (type === "other") return <LinkOutlined />;
  if (type === "nostr") return <HubOutlined />;
  return (
    <SvgIcon>
      <path d={brands[type].path} />
    </SvgIcon>
  );
}
function ConnectionList({
  connections,
  label = "Connections",
}: {
  connections: Connection[];
  label?: string;
}) {
  return (
    <Stack
      component="ul"
      sx={{ listStyle: "none", m: 0, p: 0, gap: 0.5, minWidth: 0 }}
      aria-label={label}
    >
      {connections.map((item, index) => (
        <Box component="li" key={item.id} sx={{ minWidth: 0 }}>
          <Tooltip
            title={`${connectionLabels[item.type]} · ${item.url} (opens in a new tab)`}
          >
            <Link
              href={item.url}
              target="_blank"
              rel="noreferrer"
              aria-label={`${connectionLabels[item.type]}${item.label ? ` · ${item.label}` : ` · link ${index + 1}`} · ${connectionText(item)} (opens in a new tab)`}
              underline="always"
              sx={{
                display: "inline-flex",
                alignItems: "flex-start",
                gap: 0.75,
                py: 0.5,
                minHeight: 28,
                maxWidth: "100%",
                fontSize: "0.875rem",
                textUnderlineOffset: "3px",
                "& .MuiSvgIcon-root": {
                  fontSize: 18,
                  flexShrink: 0,
                  mt: "2px",
                },
                "&:focus-visible": { outline: "2px solid", outlineOffset: 3 },
              }}
            >
              <ConnectionIcon type={item.type} />
              <Box
                component="span"
                sx={{ overflowWrap: "anywhere", minWidth: 0 }}
              >
                {connectionText(item)}
              </Box>
            </Link>
          </Tooltip>
        </Box>
      ))}
    </Stack>
  );
}

export function ConnectionLinks({
  connections,
}: {
  connections: Connection[];
}) {
  const { primary, additional } = groupConnections(connections);
  return (
    <Stack spacing={1} sx={{ minWidth: 0 }}>
      {!!primary.length && <ConnectionList connections={primary} />}
      {!!additional.length && (
        <Accordion
          disableGutters
          elevation={0}
          sx={{ bgcolor: "transparent", "&:before": { display: "none" } }}
          slotProps={{ transition: { unmountOnExit: true } }}
        >
          <AccordionSummary
            expandIcon={<ExpandMore />}
            sx={{
              px: 0,
              minHeight: 40,
              "& .MuiAccordionSummary-content": { my: 0.5 },
            }}
          >
            <Typography variant="body2">
              Additional resources ({additional.length})
            </Typography>
          </AccordionSummary>
          <AccordionDetails sx={{ px: 0, pt: 0 }}>
            <ConnectionList
              connections={additional}
              label="Additional resources"
            />
          </AccordionDetails>
        </Accordion>
      )}
    </Stack>
  );
}
