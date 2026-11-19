#!/usr/bin/env python3
"""Local owner-only sign-in; email/password travel exclusively from TTY to child stdin.
Never give passwords, OTPs, access tokens or refresh tokens to ChatGPT."""
import getpass
import json
from pathlib import Path
import subprocess
import sys

REF = "hjgerbyofaxyfqdckret"
CONFIG = Path.home() / "ChatAgentBusiness" / "v11-bs6g5-canary" / "auth.json"
CANARY = Path(__file__).resolve().with_name("bs6g5-production-auth-canary.mjs")

def main():
    if not (sys.stdin.isatty() and sys.stdout.isatty()):
        print("RUN_IN_LOCAL_INTERACTIVE_MAC_TERMINAL", file=sys.stderr)
        return 2
    if not CONFIG.is_file():
        print("B_S6G5_PRIVATE_CONFIG_MISSING", file=sys.stderr)
        return 2
    email = input("Production Auth email (local only): ").strip()
    password = getpass.getpass("Production Auth password (hidden; local only): ")
    if not email or not password:
        print("B_S6G5_INPUT_MISSING", file=sys.stderr)
        return 2
    try:
        p = subprocess.run(
            ["node",str(CANARY),"login",f"--config={CONFIG}",f"--expected-project-ref={REF}"],
            input=json.dumps({"email":email,"password":password}),
            capture_output=True,text=True,timeout=50,check=False,
        )
    finally:
        email = password = ""
    # The Node canary prints only bounded pass/fail booleans; never echo subprocess input.
    for line in (p.stdout if p.returncode==0 else p.stderr).splitlines():
        try:
            val=json.loads(line)
            if val.get("status")=="PASS" and p.returncode==0:
                print("B_S6G5_SIGNED_HTTPS_RPC_PASS")
                print("release-org ADMIN validated; refresh token in isolated macOS Keychain.")
                return 0
            if val.get("status")=="FAIL":
                print("B_S6G5_LOGIN_OR_READBACK_FAILED: "+str(val.get("code","UNKNOWN")),file=sys.stderr)
                return 1
        except ValueError:
            pass
    print("B_S6G5_UNKNOWN_RESULT",file=sys.stderr)
    return 3

if __name__=="__main__":
    raise SystemExit(main())
