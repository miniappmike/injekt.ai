// Prints the sign-in cookie that goes with scripts/preview-backend.cjs (name on the first line, value on the second).
// Set it for localhost in the browser, or hand it to Playwright with context.addCookies().
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const exp = Math.floor(Date.now() / 1000) + 86400;
const user = { id: "11111111-1111-4111-8111-111111111111", aud: "authenticated", role: "authenticated", email: "preview@example.com", email_confirmed_at: "2026-01-01T00:00:00Z", app_metadata: {}, user_metadata: {} };
const jwt = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: user.id, exp, role: "authenticated", email: user.email })}.sig`;
const session = { access_token: jwt, refresh_token: "r", token_type: "bearer", expires_in: 86400, expires_at: exp, user };
console.log("sb-127-auth-token");
console.log("base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"));
