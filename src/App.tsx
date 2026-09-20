import { createBrowserRouter, RouterProvider } from "react-router";
import { Alert, Stack } from "@mui/material";
import { IconAction, IconLink } from "./components/IconAction";
import Refresh from "@mui/icons-material/Refresh";
import HomeOutlined from "@mui/icons-material/HomeOutlined";
import { Layout } from "./components/Layout";
import NotFoundPage from "./pages/NotFoundPage";
import { Loading } from "./components/Page";
function RouteError() {
  return (
    <Stack spacing={2} sx={{ p: 4 }}>
      <Alert severity="error">This page could not be loaded.</Alert>
      <IconAction label="Reload page" onClick={() => window.location.reload()}>
        <Refresh />
      </IconAction>
      <IconLink label="Return to directory" to="/">
        <HomeOutlined />
      </IconLink>
    </Stack>
  );
}
const directory = async () => ({
  Component: (await import("./pages/DirectoryPage")).default,
});
const router = createBrowserRouter([
  {
    Component: Layout,
    HydrateFallback: Loading,
    errorElement: <RouteError />,
    children: [
      {
        path: "account/assignments",
        lazy: async () => ({
          Component: (await import("./pages/OwnershipPage")).default,
        }),
      },
      {
        path: "editor/review",
        lazy: async () => ({
          Component: (await import("./pages/ReviewQueuePage")).ReviewQueuePage,
        }),
      },
      ...["tags", "editor/tags"].map((path) => ({
        path,
        lazy: async () => ({
          Component: (await import("./pages/TagsPage")).default,
        }),
      })),
      {
        path: "activate",
        lazy: async () => ({
          Component: (await import("./pages/ActivatePage")).default,
        }),
      },
      ...[
        "login",
        "register",
        "recover",
        "account",
        "account/security",
        "account/entries",
        "admin",
        "admin/audit",
        "editor",
      ].map((path) => ({
        path,
        lazy: async () => ({
          Component: (await import("./pages/AccountPages")).default,
        }),
      })),
      {
        path: "listings/:id/edit",
        lazy: async () => ({
          Component: (await import("./pages/EditListingPage")).default,
        }),
      },
      {
        path: "listings/:id/history",
        lazy: async () => ({
          Component: (await import("./pages/HistoryPage")).default,
        }),
      },
      {
        index: true,
        lazy: directory,
      },
      ...[
        "directory",
        "groups",
        "channels",
        "businesses",
        "resources",
        "organizations",
      ].map((path) => ({ path, lazy: directory })),
      {
        path: "listings/:id",
        lazy: async () => ({
          Component: (await import("./pages/ListingPage")).default,
        }),
      },
      {
        path: "events",
        lazy: async () => ({
          Component: (await import("./pages/EventsPage")).default,
        }),
      },
      {
        path: "events/calendar",
        lazy: async () => ({
          Component: (await import("./pages/CalendarPage")).default,
        }),
      },
      {
        path: "events/add",
        lazy: async () => ({
          Component: (await import("./pages/AddEventPage")).default,
        }),
      },
      {
        path: "events/:id",
        lazy: async () => ({
          Component: (await import("./pages/EventPage")).default,
        }),
      },
      {
        path: "saved",
        lazy: async () => ({
          Component: (await import("./pages/SavedPage")).default,
        }),
      },
      {
        path: "submit",
        lazy: async () => ({
          Component: (await import("./pages/SubmitPage")).default,
        }),
      },
      {
        path: "about",
        lazy: async () => ({
          Component: (await import("./pages/AboutPage")).default,
        }),
      },
      {
        path: "donate",
        lazy: async () => ({
          Component: (await import("./pages/DonatePage")).default,
        }),
      },
      { path: "*", Component: NotFoundPage },
    ],
  },
]);
export default function App() {
  return <RouterProvider router={router} />;
}
