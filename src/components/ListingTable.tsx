import {
  Link,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { Link as RouterLink } from "react-router";
import type { Listing } from "../../shared/contracts";
import { ConnectionLinks } from "./ConnectionLinks";
import { EntryStatus } from "./EntryStatus";
import { SaveButton } from "./ListingCard";
import { TopicTags } from "./TopicTags";
export function ListingTable({ items }: { items: Listing[] }) {
  return (
    <TableContainer
      component={Paper}
      variant="outlined"
      tabIndex={0}
      role="region"
      aria-label="Directory table (scroll horizontally on small screens)"
      sx={{ maxWidth: "100%" }}
    >
      <Table
        size="small"
        aria-label="Directory entries"
        sx={{
          minWidth: { xs: 0, sm: 580 },
          tableLayout: { xs: "fixed", sm: "auto" },
        }}
      >
        <TableHead>
          <TableRow>
            <TableCell sx={{ width: { xs: "60%", sm: "auto" } }}>
              Entry
            </TableCell>
            <TableCell>Connections</TableCell>
            <TableCell sx={{ display: { xs: "none", sm: "table-cell" } }}>
              Tags
            </TableCell>
            <TableCell sx={{ display: { xs: "none", sm: "table-cell" } }}>
              <Typography component="span" variant="body2">
                Saved
              </Typography>
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell
                component="th"
                scope="row"
                sx={{ maxWidth: 320, overflowWrap: "anywhere" }}
              >
                <Stack
                  direction="row"
                  spacing={1}
                  sx={{ alignItems: "center" }}
                  data-testid="table-entry-heading"
                >
                  <Link
                    component={RouterLink}
                    to={`/listings/${item.id}`}
                    sx={{ minWidth: 0 }}
                  >
                    {item.name}
                  </Link>
                </Stack>
                <EntryStatus listing={item} />
                <Typography
                  variant="caption"
                  component="div"
                  color="text.secondary"
                >
                  {item.location ?? ""}
                </Typography>
                <Stack
                  spacing={0.5}
                  sx={{
                    display: { xs: "flex", sm: "none" },
                    mt: 0.5,
                    alignItems: "flex-start",
                  }}
                >
                  <Stack direction="row" sx={{ alignItems: "center" }}>
                    <SaveButton listing={item} />
                  </Stack>
                  <TopicTags tags={item.tags} compact />
                </Stack>
              </TableCell>
              <TableCell
                sx={{ minWidth: { xs: 0, sm: 150 }, px: { xs: 1, sm: 2 } }}
              >
                {item.connections.length ? (
                  <ConnectionLinks connections={item.connections} />
                ) : (
                  <Typography variant="caption">No links yet</Typography>
                )}
              </TableCell>
              <TableCell
                sx={{
                  display: { xs: "none", sm: "table-cell" },
                  maxWidth: 240,
                }}
              >
                <TopicTags tags={item.tags} compact />
              </TableCell>
              <TableCell sx={{ display: { xs: "none", sm: "table-cell" } }}>
                <SaveButton listing={item} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
