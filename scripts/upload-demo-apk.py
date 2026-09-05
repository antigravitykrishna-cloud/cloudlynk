"""
Upload the Jollify v0.5.0 demo APK to Cloudflare R2 and print a 7-day
presigned download URL. R2 is S3-compatible and has no per-file size cap,
unlike the user's Supabase plan (which is capped at ~50 MB on TUS upload).

Reads Cloudflare R2 credentials from .env so secrets never appear in shell
history or ps output.

Usage (from project root):
    python scripts/upload-demo-apk.py
"""

import os
import sys
from datetime import datetime, timedelta
from pathlib import Path

import boto3
from botocore.client import Config

ROOT = Path(__file__).resolve().parent.parent
ENV_FILE = ROOT / ".env"
APK_PATH = ROOT / "android/app/build/outputs/apk/release/app-release.apk"

BUCKET = "streamly-videos"  # existing R2 bucket, separate prefix avoids video paths
OBJECT_KEY = "releases/jollify-v0.5.0-demo.apk"
EXPIRES_SECONDS = 60 * 60 * 24 * 7  # 7 days


def load_env():
    if not ENV_FILE.exists():
        raise SystemExit(f".env not found at {ENV_FILE}")
    for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip())


def main():
    load_env()

    account_id = os.environ.get("EXPO_PUBLIC_CLOUDFLARE_ACCOUNT_ID")
    access_key = os.environ.get("CLOUDFLARE_R2_ACCESS_KEY_ID")
    secret_key = os.environ.get("CLOUDFLARE_R2_SECRET_ACCESS_KEY")
    bucket = os.environ.get("EXPO_PUBLIC_CLOUDFLARE_R2_BUCKET", BUCKET)

    for name, value in [
        ("EXPO_PUBLIC_CLOUDFLARE_ACCOUNT_ID", account_id),
        ("CLOUDFLARE_R2_ACCESS_KEY_ID", access_key),
        ("CLOUDFLARE_R2_SECRET_ACCESS_KEY", secret_key),
    ]:
        if not value:
            raise SystemExit(f"Missing {name} in .env")

    if not APK_PATH.exists():
        raise SystemExit(f"APK not found at {APK_PATH}")

    file_size = APK_PATH.stat().st_size
    print(f"APK: {APK_PATH.name} ({file_size / 1024 / 1024:.2f} MB)")

    endpoint = f"https://{account_id}.r2.cloudflarestorage.com"
    s3 = boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        config=Config(signature_version="s3v4"),
        region_name="auto",
    )

    print(f"Uploading to R2: {bucket}/{OBJECT_KEY}")
    s3.upload_file(
        Filename=str(APK_PATH),
        Bucket=bucket,
        Key=OBJECT_KEY,
        ExtraArgs={"ContentType": "application/vnd.android.package-archive"},
    )
    print("Upload complete.")

    print("Generating presigned URL (7 days)...")
    url = s3.generate_presigned_url(
        ClientMethod="get_object",
        Params={"Bucket": bucket, "Key": OBJECT_KEY},
        ExpiresIn=EXPIRES_SECONDS,
    )
    expires_at = datetime.utcnow() + timedelta(seconds=EXPIRES_SECONDS)

    print()
    print("=" * 60)
    print(f"  File:      {OBJECT_KEY} ({file_size / 1024 / 1024:.2f} MB)")
    print(f"  Bucket:    {bucket} (R2, private)")
    print(f"  Expires:   {expires_at.isoformat()}Z")
    print(f"  Download:  {url}")
    print("=" * 60)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nAborted.")
        sys.exit(130)
    except Exception as exc:
        print(f"FAILED: {exc}", file=sys.stderr)
        sys.exit(1)