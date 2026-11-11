import { expect, test } from "@playwright/test";

/**
 * The OAuth "Connect" surface Claude and ChatGPT use, checked the way they
 * call it: plain HTTP, no browser session.
 */

test("MCP endpoint without a token answers 401 and points to its metadata", async ({ request, baseURL }) => {
  const res = await request.post("/api/mcp", {
    data: { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
  });
  expect(res.status()).toBe(401);
  const header = res.headers()["www-authenticate"] ?? "";
  expect(header).toContain("Bearer");
  expect(header).toContain(`resource_metadata="${baseURL}/.well-known/oauth-protected-resource/api/mcp"`);
});

test("a malformed bearer token is rejected", async ({ request }) => {
  const res = await request.post("/api/mcp", {
    headers: { Authorization: "Bearer not-a-real-token" },
    data: { jsonrpc: "2.0", id: 1, method: "tools/list" },
  });
  expect(res.status()).toBe(401);
  expect((await res.json()).error).toBe("invalid_token");
});

for (const path of ["/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/api/mcp"]) {
  test(`protected resource metadata at ${path}`, async ({ request, baseURL }) => {
    const res = await request.get(path);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.resource).toBe(`${baseURL}/api/mcp`);
    expect(body.authorization_servers).toEqual([baseURL]);
  });
}

test("authorization server metadata advertises PKCE, registration and public clients", async ({ request, baseURL }) => {
  const res = await request.get("/.well-known/oauth-authorization-server");
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.issuer).toBe(baseURL);
  expect(body.authorization_endpoint).toBe(`${baseURL}/oauth/authorize`);
  expect(body.token_endpoint).toBe(`${baseURL}/oauth/token`);
  expect(body.registration_endpoint).toBe(`${baseURL}/oauth/register`);
  expect(body.code_challenge_methods_supported).toEqual(["S256"]);
  expect(body.token_endpoint_auth_methods_supported).toEqual(["none"]);
  expect(body.grant_types_supported).toEqual(["authorization_code", "refresh_token"]);
});

test("registration refuses unsafe redirect URIs", async ({ request }) => {
  for (const uri of ["http://evil.example.com/cb", "javascript:alert(1)", "https://a.example.com/cb#frag"]) {
    const res = await request.post("/oauth/register", { data: { client_name: "Test", redirect_uris: [uri] } });
    expect(res.status(), uri).toBe(400);
    expect((await res.json()).error).toBe("invalid_redirect_uri");
  }
});

test("registration refuses requests without redirect URIs or with other grants", async ({ request }) => {
  let res = await request.post("/oauth/register", { data: { client_name: "Test" } });
  expect(res.status()).toBe(400);
  res = await request.post("/oauth/register", {
    data: { redirect_uris: ["https://claude.ai/api/mcp/auth_callback"], grant_types: ["client_credentials"] },
  });
  expect(res.status()).toBe(400);
  expect((await res.json()).error).toBe("invalid_client_metadata");
});

test("token endpoint rejects unknown clients and unsupported grants", async ({ request }) => {
  let res = await request.post("/oauth/token", {
    form: { grant_type: "authorization_code", client_id: "nope", code: "x", code_verifier: "y", redirect_uri: "z" },
  });
  expect(res.status()).toBe(401);
  expect((await res.json()).error).toBe("invalid_client");
  expect(res.headers()["cache-control"]).toContain("no-store");

  res = await request.post("/oauth/token", { form: { grant_type: "password", client_id: "nope" } });
  expect(res.status()).toBe(401);
});

test("CORS preflight is answered for the OAuth endpoints", async ({ request }) => {
  const res = await request.fetch("/oauth/token", { method: "OPTIONS" });
  expect(res.status()).toBe(204);
  expect(res.headers()["access-control-allow-origin"]).toBe("*");
});