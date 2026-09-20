import { IconLink } from "../components/IconAction";
import TravelExploreOutlined from "@mui/icons-material/TravelExploreOutlined";
import { Page } from "../components/Page";
export default function NotFoundPage() {
  return (
    <Page
      title="Page not found"
      description="This link may be incomplete or the page may have moved."
    >
      <IconLink label="Explore the directory" to="/">
        <TravelExploreOutlined />
      </IconLink>
    </Page>
  );
}
