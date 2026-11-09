# B-S6G-5D — Business account read-only plugin prompt (HOLD until staging is armed)

Status: **PREPARED ONLY / DO NOT EXECUTE NOW**. Owner/maintainer must first verify all six admission gates in `B_S6G5D_EXTERNAL_READONLY_WORKSPACE_ADMISSION_20261105.md`, confirm exact newly connected staging app and approve the separate staging endpoint and OAuth consent. The existing installed `ChatAgent Business` is v1.0 production and must **NOT** be substituted.

## Instructions for the owner, once explicitly authorized

1. Open the separately logged-in **ChatGPT Business** browser/workspace, not the personal Plus account.
2. Start a fresh chat and select ONLY the explicitly verified new draft app `ChatAgent Business v1.1 B-S6G-5D ReadOnly`. If that exact app is not present or tools differ, STOP and report `NOT_RUN_WRONG_APP`.
3. Paste the text below once. Do not provide password, OTP, authorization code, access/refresh token or member email to the assistant.
4. Return only the redacted result summary, actual app name/version, observed tool name/count and whether confirmation/UI errors occurred. Do not paste private user ID/email/profile fields, raw request logs or Bearer contents.

## Exact copy-and-paste message

> B-S6G-5D isolated staging READ-ONLY acceptance. First confirm that the selected plugin is exactly `ChatAgent Business v1.1 B-S6G-5D ReadOnly` (staging), NOT `ChatAgent Business` v1.0 production or any B-S3B-3 historic app. Discover only the available named tool metadata. Require the complete advertised tool list to contain exactly one tool: `member_get_profile`, marked read-only. If the app identity, tool count, or read-only annotation is missing/mismatched, STOP without calling anything and report `NOT_RUN_WRONG_TARGET`.
>
> If verified, call the connected staging plugin's `member_get_profile` tool exactly once, with no arguments. No other tools, no retries, mutations, generic exec, filesystem, project creation, or fallback plugins. If login/consent is necessary, use the platform UI only; do not copy credentials/tokens into chat. Report only `PASS` or `FAIL`, actual tool name, call count, whether an opaque profile ID and nickname were returned (boolean only), auth/connector/confirmation UI outcome, any unexpected tool calls, and possible sensitive-data exposure (boolean only; suppress actual values).
>
> If authentication, target validation, or invocation fails, stop immediately, report a bounded error/status code and `NO_RETRY`. Do not infer success from past conversations, screenshots, or local fixture results.

## Independent auditor cross-check (must be separate)

- Check the staging-only gateway/tunnel ingress around the stated user invocation time for exactly one expected authenticated read-only request, and verify the fresh staging app/tool catalog version.
- Do not record raw bearer/request profiles; count and bounded status only.
- `PASS` requires both user-visible tool success and independently verified server arrival. UI-only report alone is provisional.
- This external staging PASS is still not authorization for Production SQLite import, migration operator credentials, final runtime secret custody, v1.1 published-app replacement or PR merge/tag.
