import test from "node:test";
import assert from "node:assert/strict";
import { bech32 } from "bech32";
import { donationSettings } from "../dist-server/server/donations.js";
import { selfHostedLightningConfig } from "../dist-server/server/lightning-address.js";

test("donations fail closed without verified-format receiving details", () => {
  assert.deepEqual(donationSettings({}), { bitcoin: null, lightning: null });
  for (const value of [
    "private key",
    "bitcoin:1test?amount=1",
    "xpub-not-an-address",
    "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNb",
  ]) {
    assert.equal(
      donationSettings({ DONATION_BITCOIN_ADDRESS: value }).bitcoin,
      null,
    );
  }
  for (const value of [
    "alice@localhost",
    "alice@127.0.0.1",
    "a@host.local",
    "a@evil.example/path",
    "lnbc123",
    "a@user:pass@example.org",
  ]) {
    assert.equal(
      donationSettings({ DONATION_LIGHTNING_ADDRESS: value }).lightning,
      null,
    );
  }
});
test("Bitcoin checksums and Lightning URI encoding use standard libraries", () => {
  // Well-known genesis address is a validation fixture ONLY, never deployment config.
  const config = donationSettings({
    DONATION_BITCOIN_ADDRESS: "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
    DONATION_LIGHTNING_ADDRESS: "Donations@EXAMPLE.org",
  });
  assert.equal(
    config.bitcoin.uri,
    "bitcoin:1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
  );
  const decoded = bech32.decode(config.lightning.uri.slice(10), 2000);
  assert.equal(decoded.prefix, "lnurl");
  assert.equal(
    Buffer.from(bech32.fromWords(decoded.words)).toString(),
    "https://example.org/.well-known/lnurlp/Donations",
  );
});

test("self-hosted Lightning Address requires the site's own HTTPS origin and LND backend", () => {
  const base = {
    APP_ENVIRONMENT: "production",
    APP_ORIGIN: "https://porcupinedirectory.com",
    DONATION_LIGHTNING_ADDRESS: "donate@porcupinedirectory.com",
    DONATION_LIGHTNING_LND_REST_URL: "https://lnd.internal:8080",
    DONATION_LIGHTNING_LND_MACAROON_HEX: "ab",
  };
  const config = selfHostedLightningConfig(base);
  assert.equal(
    config?.callback,
    "https://porcupinedirectory.com/.well-known/lnurlp/donate/callback",
  );
  assert.equal(config?.minSendable, 1_000);
  assert.equal(config?.maxSendable, 1_000_000_000);
  assert.equal(
    selfHostedLightningConfig({
      ...base,
      DONATION_LIGHTNING_ADDRESS: "donate@other.example",
    }),
    null,
  );
  assert.equal(
    selfHostedLightningConfig({
      ...base,
      APP_ORIGIN: "http://porcupinedirectory.com",
    }),
    null,
  );
});

test("self-hosted Lightning Address accepts a secure restricted NWC connection", () => {
  const config = selfHostedLightningConfig({
    APP_ENVIRONMENT: "production",
    APP_ORIGIN: "https://porcupinedirectory.com",
    DONATION_LIGHTNING_ADDRESS: "donate@porcupinedirectory.com",
    DONATION_LIGHTNING_NWC_URL: `nostr+walletconnect://${"a".repeat(64)}?relay=${encodeURIComponent("wss://relay.example")}&secret=${"b".repeat(64)}`,
  });
  assert.equal(config?.nwcUrl?.startsWith("nostr+walletconnect://"), true);
  assert.equal(config?.lndRestUrl, undefined);
  assert.equal(
    selfHostedLightningConfig({
      APP_ENVIRONMENT: "production",
      APP_ORIGIN: "https://porcupinedirectory.com",
      DONATION_LIGHTNING_ADDRESS: "donate@porcupinedirectory.com",
      DONATION_LIGHTNING_NWC_URL: `nostr+walletconnect://${"a".repeat(64)}?relay=${encodeURIComponent("ws://relay.example")}&secret=${"b".repeat(64)}`,
    }),
    null,
  );
});
