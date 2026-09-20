import {
  Box,
  Card,
  CardActionArea,
  CardContent,
  Stack,
  Typography,
} from "@mui/material";
import { Link } from "react-router";
import { Page } from "../components/Page";
import { IconLink } from "../components/IconAction";
import TravelExploreOutlined from "@mui/icons-material/TravelExploreOutlined";
import AddCircleOutline from "@mui/icons-material/AddCircleOutlined";
const sections = [
  {
    title: "Explore",
    to: "/directory",
    description: "Find communities, services and resources in one directory.",
  },
  {
    title: "Signal connections",
    to: "/directory?connection=signal",
    description: "Find entries with Signal chats and learn how to join.",
  },
  {
    title: "Businesses",
    to: "/directory?tag=Business",
    description: "Find services, shops, and community businesses.",
  },
  {
    title: "Browse tags",
    to: "/tags",
    description: "Discover topics and combine tags to narrow your search.",
  },
  {
    title: "Nonprofits",
    to: "/directory?tag=Nonprofit",
    description:
      "Explore entries with a nonprofit descriptor, not a guarantee of status.",
  },
  {
    title: "Events",
    to: "/events",
    description: "See what’s coming up across New Hampshire.",
  },
  {
    title: "Saved",
    to: "/saved",
    description: "Return to your privately saved favorites.",
  },
];
export default function HomePage() {
  return (
    <Page
      title="Find your people. Find your way in."
      description="Your starting point for New Hampshire’s liberty community. Pick a section or search for an interest, place, or name."
    >
      <Stack direction="row" spacing={1}>
        <IconLink label="Explore all entries" to="/directory">
          <TravelExploreOutlined />
        </IconLink>
        <IconLink label="Add an entry" to="/submit">
          <AddCircleOutline />
        </IconLink>
      </Stack>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            sm: "1fr 1fr",
            lg: "repeat(3, 1fr)",
          },
          gap: 2,
        }}
      >
        {sections.map((section) => (
          <Card key={section.to}>
            <CardActionArea
              component={Link}
              to={section.to}
              sx={{ height: "100%" }}
            >
              <CardContent sx={{ p: 3 }}>
                <Typography variant="h2" sx={{ mb: 1 }}>
                  {section.title}
                </Typography>
                <Typography color="text.secondary">
                  {section.description}
                </Typography>
              </CardContent>
            </CardActionArea>
          </Card>
        ))}
      </Box>
      <Typography variant="body2" color="text.secondary">
        No login needed. Entries retain their source links and joining
        instructions. <Link to="/about">How the directory works</Link>
      </Typography>
    </Page>
  );
}
