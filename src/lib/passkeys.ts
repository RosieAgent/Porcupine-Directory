import {
  startRegistration,
  startAuthentication,
} from "@simplewebauthn/browser";
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";
import { z } from "zod";
import { mutate } from "./api";
import { okSchema } from "../../shared/auth";
// Options come from our server and are subsequently validated by the browser WebAuthn API.
export async function registerPasskey() {
  const optionsJSON = await mutate(
    "/auth/passkeys/register/options",
    z.custom<PublicKeyCredentialCreationOptionsJSON>(
      (v) => !!v && typeof v === "object" && "challenge" in v,
    ),
  );
  const response = await startRegistration({ optionsJSON });
  await mutate("/auth/passkeys/register/verify", okSchema, response);
}
export async function authenticatePasskey() {
  const optionsJSON = await mutate(
    "/auth/passkeys/login/options",
    z.custom<PublicKeyCredentialRequestOptionsJSON>(
      (v) => !!v && typeof v === "object" && "challenge" in v,
    ),
  );
  const response = await startAuthentication({ optionsJSON });
  await mutate("/auth/passkeys/login/verify", okSchema, response);
}
