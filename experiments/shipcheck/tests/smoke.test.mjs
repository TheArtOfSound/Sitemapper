import test from "node:test";
import assert from "node:assert/strict";

const BASE = process.env.SHIPCHECK_BASE_URL || "https://shipcheck.imagineqira.com";
const LIVE = process.env.SHIPCHECK_LIVE === "1";
const opts = { skip: !LIVE };

async function request(path, init = {}) {
  const res = await fetch(new URL(path, BASE), { ...init, signal: AbortSignal.timeout(16000) });
  let body;
  const contentType = res.headers.get("content-type") || "";
  body = contentType.includes("json") ? await res.json() : await res.text();
  return { status: res.status, headers: res.headers, body };
}
function post(path, body) {
  return request(path, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body) });
}

test("public landing shows precise scope, consent and Codex brief", opts, async () => {
  const r = await request("/");
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-type") || "", /text\/html/);
  assert.match(r.body, /ShipCheck/);
  assert.match(r.body, /Copy Codex investigation brief/);
  assert.match(r.body, /does NOT prove a checkout|not an actual checkout|does not.*payment/i);
  assert.match(r.body, /not a subscription|not live billing|not accepting paid/i);
});

test("health never advertises live billing", opts, async () => {
  const r = await request("/health");
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  assert.equal(r.body.billing, "not enabled");
});

for (const home of [
  "http://example.com/",
  "https://127.0.0.1/",
  "https://localhost/",
  "https://metadata.google.internal/",
  "https://example.com:9443/"
]) {
  test(`rejects unsafe or disallowed URL: ${home}`, opts, async () => {
    const r = await post("/api/check", { home, source: "qa" });
    assert.equal(r.status, 400);
  });
}

test("rejects malformed JSON and missing required home", opts, async () => {
  const r = await post("/api/check", { critical: "https://www.cloudflare.com/" });
  assert.equal(r.status, 400);
});

test("rejects interest without affirmative permission", opts, async () => {
  const r = await post("/api/interest", {
    email:"never-write-shipcheck-smoke@example.com",
    choice:"beta",
    consent:false,
    source:"qa"
  });
  assert.equal(r.status,400);
});

test("public scanner emits structured HTTP evidence without payment assertions", opts, async () => {
  // This creates one anonymous scan event attributed 'qa'. It does not create a lead or subscription.
  const r = await post("/api/check", {
    home:"https://www.cloudflare.com/",
    critical:"https://www.cloudflare.com/shipcheck-test-nonexistent-f83be0/",
    source:"qa"
  });
  assert.equal(r.status,200);
  assert.equal(r.body.results?.length,2);
  for (const observation of r.body.results) {
    assert.equal(typeof observation.url, "string");
    assert.equal(typeof observation.ok, "boolean");
    assert.equal(typeof observation.elapsed_ms,"number");
    assert.ok(observation.status !== undefined);
  }
  assert.match(r.body.limits, /no browser interaction/i);
});

// Deliberately absent: live paid checkout tests, messages to beta users, public private-network probes,
// and real form submissions. Those require authorized fixtures in a separate staging environment.
