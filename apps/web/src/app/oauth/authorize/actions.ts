"use server";

import { redirect } from "next/navigation";
import { OAUTH_SCOPE, randomToken, sha256Hex } from "@/lib/oauth";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/supabase/server";
import { checkAuthorizeRequest, readAuthorizeParams, redirectWith } from "./request";

/** The user clicked Allow: issue a one-time code and send it back to the app. */
export async function approve(formData: FormData): Promise<void> {
  const { userId } = await requireUser();
  const checked = await checkAuthorizeRequest(readAuthorizeParams((k) => formData.get(k)));
  if (checked.kind === "fatal") redirect(`/oauth/authorize?error=${encodeURIComponent(checked.message)}`);
  if (checked.kind === "redirect-error") redirect(checked.url);

  const { client, params, issuer } = checked;
  const code = randomToken("lko_");
  const { error } = await createAdminClient()
    .from("oauth_codes")
    .insert({
      code_hash: sha256Hex(code),
      client_id: client.client_id,
      user_id: userId,
      redirect_uri: params.redirect_uri,
      code_challenge: params.code_challenge,
      scope: OAUTH_SCOPE,
      resource: params.resource || null,
    });
  if (error) {
    redirect(redirectWith(params.redirect_uri, { error: "server_error", state: params.state, iss: issuer }));
  }
  redirect(redirectWith(params.redirect_uri, { code, state: params.state, iss: issuer }));
}

/** The user clicked Cancel. */
export async function deny(formData: FormData): Promise<void> {
  await requireUser();
  const checked = await checkAuthorizeRequest(readAuthorizeParams((k) => formData.get(k)));
  if (checked.kind === "fatal") redirect("/settings");
  const target =
    checked.kind === "redirect-error"
      ? checked.url
      : redirectWith(checked.params.redirect_uri, {
          error: "access_denied",
          error_description: "The user did not allow access.",
          state: checked.params.state,
          iss: checked.issuer,
        });
  redirect(target);
}