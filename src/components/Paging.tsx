import {
  MenuItem,
  Pagination,
  PaginationItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { Link, useLocation, useSearchParams } from "react-router";
import { updatedSearch } from "../lib/urls";
export function Paging({
  total,
  page,
  pageSize,
}: {
  total: number;
  page: number;
  pageSize: number;
}) {
  const [params, setParams] = useSearchParams();
  const { pathname } = useLocation();
  return (
    <Stack spacing={2} sx={{ alignItems: "center" }}>
      <Typography variant="body2" color="text.secondary" role="status">
        {total} results · Page {page} of{" "}
        {Math.max(1, Math.ceil(total / pageSize))}
      </Typography>
      <Pagination
        count={Math.max(1, Math.ceil(total / pageSize))}
        page={page}
        color="primary"
        siblingCount={0}
        renderItem={(item) => (
          <PaginationItem
            {...item}
            component={Link}
            to={{
              pathname,
              search:
                "?" + updatedSearch(params, { page: String(item.page ?? 1) }),
            }}
          />
        )}
      />
      <TextField
        select
        label="Results per page"
        value={pageSize}
        sx={{ minWidth: 160 }}
        onChange={(event) =>
          setParams(updatedSearch(params, { pageSize: event.target.value }))
        }
      >
        {[25, 50, 100].map((size) => (
          <MenuItem key={size} value={size}>
            {size}
          </MenuItem>
        ))}
      </TextField>
    </Stack>
  );
}
