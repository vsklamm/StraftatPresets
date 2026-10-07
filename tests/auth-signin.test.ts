import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import SignInPage from "../app/auth/signin/page";

test("OAuth callback failures use the app dialog and a local Discord icon", async () => {
  const page = await SignInPage({ searchParams: Promise.resolve({ error: "OAuthCallback" }) });
  const html = renderToStaticMarkup(page);
  assert.match(html, /auth-dialog/);
  assert.match(html, /Discord sign-in could not be completed/);
  assert.match(html, /discord-signin/);
  assert.match(html, /discord-signin-icon/);
  assert.doesNotMatch(html, /authjs\.dev|different account/);
});

test("unknown authentication errors cannot inject text or markup", async () => {
  const page = await SignInPage({ searchParams: Promise.resolve({ error: "<script>private</script>" }) });
  const html = renderToStaticMarkup(page);
  assert.match(html, /Sign-in could not be completed/);
  assert.doesNotMatch(html, /private/);
});
