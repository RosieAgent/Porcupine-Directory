import { useQuery } from "@tanstack/react-query";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Card,
  CardContent,
  Link,
  Stack,
  Typography,
} from "@mui/material";
import ExpandMore from "@mui/icons-material/ExpandMore";
import { queries } from "../lib/api";
import { ErrorState, Loading, Page } from "../components/Page";
import { safeExternalUrl } from "../lib/urls";
import { CONFIRMATION_FRESH_DAYS } from "../../shared/trust";

export default function AboutPage() {
  const result = useQuery(queries.sources);
  return (
    <Page
      title="About"
      description="A community directory for finding groups, conversations, businesses, resources, and events in New Hampshire."
    >
      <Accordion defaultExpanded>
        <AccordionSummary expandIcon={<ExpandMore />}>
          <Typography variant="h2">About this directory</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Stack spacing={2}>
            <Typography>
              Entries keep their source attribution and joining instructions.
              Importing an entry does not confirm its accuracy or guarantee
              admission to a group. New submissions are normally published
              without independent confirmation; editors can hide entries or
              enable a publication queue. Self-confirmation and editor review
              are separate, dated records, not guarantees of accuracy.
            </Typography>
            <Typography>
              A lightbulb means an explicitly proposed idea, not an established
              group. Seeking an organizer is separate from private account
              ownership. A broken-link badge means no connection link or usable
              joining instructions are recorded; it does not mean the group is
              closed or does not exist. Missing data is never automatically
              labeled as an idea. Filters can show ideas, entries seeking
              organizers, or entries missing joining details.
            </Typography>
            <Typography>
              Editors manage the tag catalog; contributors select existing tags.
              Selecting multiple tags matches all of them. Signal and other
              platform filters use the entry’s connection types, not its topic
              tags. A Nonprofit tag is an editorial descriptor, not a legal or
              tax-status certification. This independent directory is not an
              official FSP service and does not imply affiliation or endorsement
              by listed organizations.
            </Typography>
          </Stack>
        </AccordionDetails>
      </Accordion>
      <Accordion>
        <AccordionSummary expandIcon={<ExpandMore />}>
          <Typography variant="h2">Sources</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Stack spacing={2}>
            <Typography>
              A lock marks an invite-only or private group, not a confidential
              listing. Directory entries and invitation instructions are public.
              Prefer a group-managed request form or public contact page; do not
              publish private invite links or personal contact details without
              permission. Revisions are retained for audit, so removing a detail
              from the current entry does not erase its history. Porcupine
              Directory does not collect or forward invitation requests.
              External services have their own privacy practices.
            </Typography>
            <Typography>
              Some directory data may be assisted by AI analysis of publicly
              available organization and business websites. AI can help identify
              and summarize names, descriptions, services, contact details, and
              other relevant information for review; it is not an independent
              source or proof of accuracy. Original website links and source
              attributions are retained where available. Check the original
              source before relying on an entry.
            </Typography>
            <Typography>
              The Porcupine Report page shows recent titles and dates from its
              publisher’s podcast RSS feed. Our server checks hourly and stores
              a small public cache, not your viewing history. Failed checks
              retain the last successful result and are shown as unavailable
              updates, not proof that the publisher is inactive. External
              players, images and audio do not load automatically. Publication
              dates are publisher claims, not independent confirmation; they do
              not currently change ranking.
            </Typography>
            <Typography>
              Optional donations support the directory, never listing position
              or trust badges. The donation page has no donor profiles or
              payment tracking. Bitcoin transfers are public and wallets/payment
              providers have their own privacy practices; no payment method
              guarantees anonymity.
            </Typography>
            {result.isPending ? (
              <Loading />
            ) : result.error ? (
              <ErrorState
                error={result.error}
                retry={() => void result.refetch()}
              />
            ) : (
              <Stack spacing={2}>
                {result.data.sources.map((source) => (
                  <Card key={source.sourceUrl}>
                    <CardContent>
                      <Typography variant="h3">
                        <Link
                          href={safeExternalUrl(source.sourceUrl)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {source.displayName}
                        </Link>
                      </Typography>
                      <Typography sx={{ my: 1 }}>
                        {source.itemCount} source entries ·{" "}
                        {source.lastSyncedAt
                          ? "Updated " +
                            new Date(source.lastSyncedAt).toLocaleString()
                          : "Not yet imported"}
                      </Typography>
                      {source.status === "partial" && (
                        <Alert severity="info">
                          Some recurrence rules could not be read. Check the
                          original calendar for the full schedule.
                        </Alert>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </Stack>
            )}
            <Alert severity="info">
              This is a local preview. The FSP calendar is checked hourly while
              the server runs; directory-document imports are manual. URLs on
              localhost work on this machine; sharing with other people will
              require a publicly hosted domain.
            </Alert>
          </Stack>
        </AccordionDetails>
      </Accordion>
      <Accordion>
        <AccordionSummary expandIcon={<ExpandMore />}>
          <Typography variant="h2">Ranking</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Stack spacing={2}>
            <Typography>
              Entries with joining or contact details always appear before
              entries missing those details, including when sorting by name or
              update date. This grouping applies across the full results before
              pagination, not just within each page. Entries are still visible
              and can be found with the Joining details missing filter. Within
              each group, the default is Confirmation first: entries with both a
              recent editor review and owner confirmation appear first, then
              editor-reviewed entries, then owner-confirmed entries, then
              entries with neither recent check. Within each tier, names are
              alphabetical (with a stable ID tie-breaker). Search and other
              filters narrow the eligible entries before sorting. Choose Name
              A–Z or Recently updated in Filters to use those orders within each
              group instead; your choice stays in the shared URL.
            </Typography>
            <Typography>
              A check is recent for {CONFIRMATION_FRESH_DAYS} days. Older checks
              retain their original dates, show a needs-rechecking history icon,
              and no longer boost ordering. Hover, focus or long-press a badge
              for its date in New Hampshire time. Age alone never creates trust.
              Material edits and restores clear previous confirmations and
              reviews. Repeated confirmations do not accumulate votes or points.
            </Typography>
            <Typography>
              Owner confirmation is a self-report. Editor review records that a
              privileged editor checked the saved entry; it is not proof of
              independence, an endorsement, a guarantee of accuracy or
              admission, or a safety certification. The same account may own and
              review an entry. Confirmation tiers consider those dated checks
              only—not clicks, bookmarks, donations, popularity, account age or
              a personalized profile. Website research and import dates do not
              count as confirmation. There are no member-attestation votes in
              this release.
            </Typography>
          </Stack>
        </AccordionDetails>
      </Accordion>
      <Accordion>
        <AccordionSummary expandIcon={<ExpandMore />}>
          <Typography variant="h2">Privacy</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Stack spacing={2}>
            <Typography>
              Browse without an account. Anonymous bookmarks stay in your
              browser; account bookmarks sync privately and are not end-to-end
              encrypted. There are no analytics or external font requests.
              Signing in or submitting uses an essential session cookie.
              Following an external link takes you to that service’s own privacy
              practices.
            </Typography>
            <Typography>
              Account usernames and entry ownership are private. No real name or
              email is required. Passwords and recovery phrases are stored as
              verifiers; optional verified recovery emails are encrypted.
              Editors and administrators can search private usernames and
              display aliases to propose entry ownership. They can see private
              manager aliases and directory revision history, but cannot browse
              users’ saved entries. Administrators and database operators still
              have operational access. Short-lived keyed network identifiers
              help limit abuse; this is data minimization, not a promise of
              network anonymity. Do not submit private information in entry text
              or revision reasons.
            </Typography>
          </Stack>
        </AccordionDetails>
      </Accordion>
    </Page>
  );
}
