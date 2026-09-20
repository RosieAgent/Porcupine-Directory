export const eventSources = {
  fsp_calendar: {
    name: "FSP Community Calendar",
    url: "https://community.fsp.org/calendar/",
    submitUrl: "https://community.fsp.org/calendar/submit-event/",
    accountUrl: "https://community.fsp.org/my-account/",
    accessUrl: "https://form-usa.keela.co/calendar-access",
    dashboardUrl: "https://community.fsp.org/calendar-dashboard/",
    guideUrl: "https://weare.dcnh.tv/w/gFjoqAfkgBr4D8Vd6DKJHZ",
  },
} as const;

export function eventSourceName(key: string) {
  return key in eventSources
    ? eventSources[key as keyof typeof eventSources].name
    : key;
}

export const EVENT_TIMEZONE = "America/New_York";
export const POLL_INTERVAL_MS = 60 * 60 * 1000;
