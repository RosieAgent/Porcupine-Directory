import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, Paper, Stack, Typography } from "@mui/material";
import CurrencyBitcoin from "@mui/icons-material/CurrencyBitcoin";
import Bolt from "@mui/icons-material/Bolt";
import ContentCopy from "@mui/icons-material/ContentCopy";
import AccountBalanceWalletOutlined from "@mui/icons-material/AccountBalanceWalletOutlined";
import { donationsResponse } from "../../shared/donations";
import { request } from "../lib/api";
import { ErrorState, Loading, Page } from "../components/Page";
import { IconAction, IconLink } from "../components/IconAction";

export default function DonatePage() {
  const result = useQuery({
    queryKey: ["donations"],
    queryFn: ({ signal }) =>
      request("/donations", donationsResponse, { signal }),
    staleTime: 0,
  });
  const [message, setMessage] = useState("");
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setMessage(
        "Receiving address copied. Verify it in your wallet before sending.",
      );
    } catch {
      setMessage(
        "Copy failed. Select and copy the displayed receiving address instead.",
      );
    }
  }
  return (
    <Page
      title="Support Porcupine Directory"
      description="Help fund hosting, maintenance and continued development of this community directory."
    >
      <Typography>
        Exploring and sharing the directory stays free. Donations are optional
        and never buy confirmation badges, priority placement or access to
        people’s data.
      </Typography>
      {result.isPending ? (
        <Loading />
      ) : result.error ? (
        <ErrorState error={result.error} retry={() => void result.refetch()} />
      ) : (
        <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
          {(
            [
              {
                key: "bitcoin",
                title: "Bitcoin",
                icon: <CurrencyBitcoin />,
                note: "Send on the Bitcoin main network. Choose the amount and check fees in your wallet.",
              },
              {
                key: "lightning",
                title: "Lightning",
                icon: <Bolt />,
                note: "Use a Lightning wallet that supports Lightning addresses or LNURL-pay. Your wallet requests the invoice directly from the receiving provider.",
              },
            ] as const
          ).map(({ key, title, icon, note }) => {
            const destination = result.data[key];
            return (
              <Paper
                key={key}
                component="section"
                aria-label={title}
                variant="outlined"
                sx={{ p: 3, flex: 1, minWidth: 0 }}
              >
                <Stack spacing={2}>
                  <Stack
                    direction="row"
                    spacing={1}
                    sx={{ alignItems: "center" }}
                  >
                    {icon}
                    <Typography variant="h2">{title}</Typography>
                  </Stack>
                  <Typography variant="body2">{note}</Typography>
                  {destination ? (
                    <>
                      <Typography
                        component="code"
                        sx={{ overflowWrap: "anywhere", userSelect: "all" }}
                      >
                        {destination.address}
                      </Typography>
                      <Stack direction="row" spacing={1}>
                        <IconAction
                          label={`Copy ${title} receiving address`}
                          onClick={() => void copy(destination.address)}
                        >
                          <ContentCopy />
                        </IconAction>
                        <IconLink
                          label={`Open ${title} wallet`}
                          href={destination.uri}
                        >
                          <AccountBalanceWalletOutlined />
                        </IconLink>
                      </Stack>
                    </>
                  ) : (
                    <Alert severity="info">
                      {key === "bitcoin"
                        ? "Bitcoin address: TBD. Payments are disabled."
                        : "Not available yet. A receiving address has not been configured."}
                    </Alert>
                  )}
                </Stack>
              </Paper>
            );
          })}
        </Stack>
      )}
      {message && <Typography role="status">{message}</Typography>}
      <Paper variant="outlined" sx={{ p: 3 }}>
        <Stack spacing={2}>
          <Typography variant="h2">Your privacy</Typography>
          <Typography variant="body2">
            No account, name, email or donation form is required. This page does
            not track payments or publish a donor list. Bitcoin transactions are
            public; a shared receiving address can link donations. Lightning
            providers and wallets have their own privacy practices. Neither
            method guarantees anonymity.
          </Typography>
          <Typography variant="body2">
            Always verify the destination, network, amount and fees in your
            wallet. This site never asks for wallet keys or recovery phrases,
            and does not confirm receipt of payment.
          </Typography>
          <Typography variant="body2">
            Lightning payments here do not publish Nostr zap receipts. Nostr
            zaps need a separate recipient setup and privacy choice. Dash,
            Monero and USD are future options, not currently supported.
          </Typography>
        </Stack>
      </Paper>
    </Page>
  );
}
