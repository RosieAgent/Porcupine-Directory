import { request as httpRequest, type RequestOptions } from "node:http";
import {
  request as httpsRequest,
  type RequestOptions as HttpsRequestOptions,
} from "node:https";
import type { IncomingMessage } from "node:http";
import { NWCClient } from "@getalby/sdk";
import { Router, type RequestHandler } from "express";
import { limit } from "./security.js";
import { parseLightningAddress, type LightningAddress } from "./donations.js";

const DEFAULT_MIN_SENDABLE_MSAT = 1_000;
const DEFAULT_MAX_SENDABLE_MSAT = 1_000_000_000;
const DEFAULT_EXPIRY_SECONDS = 3_600;
const MAX_LND_RESPONSE_BYTES = 64 * 1024;

interface LightningAddressConfig extends LightningAddress {
  origin: URL;
  callback: string;
  minSendable: number;
  maxSendable: number;
  expirySeconds: number;
  memo: string;
  nwcUrl?: string;
  lndRestUrl?: URL;
  macaroonHex?: string;
  tlsCa?: Buffer;
}

interface InvoiceBackend {
  createInvoice(amountMsat: number): Promise<string>;
}

interface LndInvoiceResponse {
  payment_request?: unknown;
}

function positiveInteger(
  value: string | undefined,
  fallback: number,
  maximum: number,
): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= maximum
    ? parsed
    : fallback;
}

export function selfHostedLightningConfig(
  env: NodeJS.ProcessEnv = process.env,
): LightningAddressConfig | null {
  const address = parseLightningAddress(env.DONATION_LIGHTNING_ADDRESS);
  const originValue = env.APP_ORIGIN?.trim();
  const nwcUrl = env.DONATION_LIGHTNING_NWC_URL?.trim();
  const lndRestValue = env.DONATION_LIGHTNING_LND_REST_URL?.trim();
  const macaroonHex = env.DONATION_LIGHTNING_LND_MACAROON_HEX?.trim();
  if (!address || !originValue || (!nwcUrl && (!lndRestValue || !macaroonHex)))
    return null;

  let origin: URL;
  let lndRestUrl: URL | undefined;
  try {
    origin = new URL(originValue);
    if (!nwcUrl && lndRestValue) lndRestUrl = new URL(lndRestValue);
  } catch {
    return null;
  }
  let parsedNwcUrl: string | undefined;
  if (nwcUrl) {
    try {
      const parsed = NWCClient.parseWalletConnectUrl(nwcUrl, true);
      if (parsed.relayUrls.some((relay) => new URL(relay).protocol !== "wss:"))
        return null;
      parsedNwcUrl = nwcUrl;
    } catch {
      return null;
    }
  }
  if (
    origin.protocol !== "https:" ||
    address.domain !== origin.hostname.toLowerCase() ||
    (!parsedNwcUrl &&
      (!lndRestUrl ||
        !["https:", "http:"].includes(lndRestUrl.protocol) ||
        (env.APP_ENVIRONMENT === "production" &&
          lndRestUrl.protocol !== "https:") ||
        !macaroonHex ||
        !/^[0-9a-f]+$/i.test(macaroonHex) ||
        macaroonHex.length % 2 !== 0))
  )
    return null;

  const minSendable = positiveInteger(
    env.DONATION_LIGHTNING_MIN_MSAT,
    DEFAULT_MIN_SENDABLE_MSAT,
    DEFAULT_MAX_SENDABLE_MSAT,
  );
  const maxSendable = positiveInteger(
    env.DONATION_LIGHTNING_MAX_MSAT,
    DEFAULT_MAX_SENDABLE_MSAT,
    21_000_000_000_000,
  );
  if (minSendable > maxSendable) return null;

  const tlsCaB64 = env.DONATION_LIGHTNING_LND_TLS_CERT_B64?.trim();
  let tlsCa: Buffer | undefined;
  if (tlsCaB64) {
    try {
      tlsCa = Buffer.from(tlsCaB64, "base64");
      if (!tlsCa.length || !tlsCa.includes(Buffer.from("BEGIN CERTIFICATE")))
        return null;
    } catch {
      return null;
    }
  }

  const callbackPath = `/.well-known/lnurlp/${encodeURIComponent(address.username)}/callback`;
  return {
    ...address,
    origin,
    callback: new URL(callbackPath, origin).toString(),
    minSendable,
    maxSendable,
    expirySeconds: positiveInteger(
      env.DONATION_LIGHTNING_EXPIRY_SECONDS,
      DEFAULT_EXPIRY_SECONDS,
      7 * 86400,
    ),
    memo: env.DONATION_LIGHTNING_MEMO?.trim() || "Porcupine Directory donation",
    nwcUrl: parsedNwcUrl,
    lndRestUrl,
    macaroonHex,
    tlsCa,
  };
}

function responseBody(response: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    response.setEncoding("utf8");
    response.on("data", (chunk: string) => {
      body += chunk;
      if (Buffer.byteLength(body) > MAX_LND_RESPONSE_BYTES) {
        response.destroy(new Error("LND response too large."));
      }
    });
    response.on("end", () => resolve(body));
    response.on("error", reject);
  });
}

function postJson(
  url: URL,
  headers: Record<string, string>,
  body: string,
  tlsCa?: Buffer,
): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const common: RequestOptions = {
      hostname: url.hostname,
      port: url.port || undefined,
      path: `${url.pathname}${url.search}`,
      method: "POST",
      headers,
      timeout: 10_000,
    };
    const finish = async (response: IncomingMessage) => {
      try {
        resolve({
          statusCode: response.statusCode ?? 0,
          body: await responseBody(response),
        });
      } catch (error) {
        reject(error);
      }
    };
    const request =
      url.protocol === "https:"
        ? httpsRequest(
            { ...common, ca: tlsCa } satisfies HttpsRequestOptions,
            finish,
          )
        : httpRequest(common, finish);
    request.on("error", reject);
    request.on("timeout", () =>
      request.destroy(new Error("LND request timed out.")),
    );
    request.write(body);
    request.end();
  });
}

function createLndBackend(config: LightningAddressConfig): InvoiceBackend {
  if (!config.lndRestUrl || !config.macaroonHex) {
    throw new Error("LND invoice backend is not configured.");
  }
  const { lndRestUrl, macaroonHex } = config;
  const invoiceUrl = new URL("/v1/invoices", lndRestUrl);
  return {
    async createInvoice(amountMsat) {
      const body = JSON.stringify({
        memo: config.memo,
        value_msat: String(amountMsat),
        expiry: String(config.expirySeconds),
      });
      const response = await postJson(
        invoiceUrl,
        {
          "Content-Type": "application/json",
          "Content-Length": String(Buffer.byteLength(body)),
          "Grpc-Metadata-macaroon": macaroonHex,
        },
        body,
        config.tlsCa,
      );
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw new Error(`LND returned HTTP ${response.statusCode}.`);
      }
      let data: LndInvoiceResponse;
      try {
        data = JSON.parse(response.body) as LndInvoiceResponse;
      } catch {
        throw new Error("LND returned invalid JSON.");
      }
      if (
        typeof data.payment_request !== "string" ||
        !data.payment_request.startsWith("lnbc")
      ) {
        throw new Error("LND returned no mainnet payment request.");
      }
      return data.payment_request;
    },
  };
}

function createNwcBackend(config: LightningAddressConfig): InvoiceBackend {
  if (!config.nwcUrl) throw new Error("NWC invoice backend is not configured.");
  return {
    async createInvoice(amountMsat) {
      const client = new NWCClient({
        nostrWalletConnectUrl: config.nwcUrl,
        requireSecret: true,
      });
      try {
        const result = await client.makeInvoice({
          amount: amountMsat,
          description: config.memo,
          expiry: config.expirySeconds,
        });
        if (
          typeof result.invoice !== "string" ||
          !result.invoice.startsWith("lnbc")
        ) {
          throw new Error("Alby Hub returned no mainnet payment request.");
        }
        return result.invoice;
      } finally {
        await client.close();
      }
    },
  };
}

function protocolError(res: import("express").Response, reason: string) {
  res.status(200).json({ status: "ERROR", reason });
}

function usernameMatches(config: LightningAddressConfig, username: string) {
  return username === config.username;
}

export function createLightningAddressRouter(
  env: NodeJS.ProcessEnv = process.env,
  backend?: InvoiceBackend,
): Router {
  const router = Router();
  const config = selfHostedLightningConfig(env);
  if (!config) return router;
  const invoiceBackend =
    backend ??
    (config.nwcUrl ? createNwcBackend(config) : createLndBackend(config));
  const callbackLimiter: RequestHandler = limit("lnurl-invoice", 60, 60);

  router.get("/.well-known/lnurlp/:username", (req, res) => {
    const username = req.params.username;
    if (typeof username !== "string" || !usernameMatches(config, username)) {
      res.status(404).end();
      return;
    }
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.json({
      status: "OK",
      tag: "payRequest",
      callback: config.callback,
      minSendable: config.minSendable,
      maxSendable: config.maxSendable,
      metadata: JSON.stringify([
        ["text/plain", config.memo],
        ["text/identifier", config.address],
      ]),
      commentAllowed: 0,
    });
  });

  router.get(
    "/.well-known/lnurlp/:username/callback",
    callbackLimiter,
    async (req, res) => {
      const username = req.params.username;
      if (typeof username !== "string" || !usernameMatches(config, username)) {
        res.status(404).end();
        return;
      }
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Access-Control-Allow-Origin", "*");
      const amountValue = req.query.amount;
      const amount =
        typeof amountValue === "string" ? Number(amountValue) : Number.NaN;
      if (
        !Number.isSafeInteger(amount) ||
        amount < config.minSendable ||
        amount > config.maxSendable
      ) {
        protocolError(
          res,
          "The requested amount is outside the accepted range.",
        );
        return;
      }
      try {
        const paymentRequest = await invoiceBackend.createInvoice(amount);
        res.json({ status: "OK", routes: [], pr: paymentRequest });
      } catch (error) {
        console.error(
          "LNURL invoice creation failed",
          error instanceof Error ? error.name : "UnknownError",
        );
        protocolError(res, "Unable to create a Lightning invoice right now.");
      }
    },
  );
  return router;
}

export const lightningAddress = createLightningAddressRouter();
