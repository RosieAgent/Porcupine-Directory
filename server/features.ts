// UI availability never implicitly chooses the staff authentication policy.
export const passkeysEnabled = () => process.env.PASSKEYS_ENABLED === "true";
export const staffAuthMode = () =>
  process.env.STAFF_AUTH_MODE === "session"
    ? ("session" as const)
    : process.env.STAFF_AUTH_MODE === "password_recent"
      ? ("password_recent" as const)
      : ("passkey" as const);
