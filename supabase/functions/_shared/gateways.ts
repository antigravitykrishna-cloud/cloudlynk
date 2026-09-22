// Payment gateway clients for the `payments` edge function: Razorpay,
// Sabpaisa, and Google Play's external-transaction reporting.
//
// Every secret lives in Supabase function secrets, never in the app:
//
//   RAZORPAY_KEY_ID            public key id (also returned to the app)
//   RAZORPAY_KEY_SECRET        signs checkout results, authenticates API calls
//   RAZORPAY_WEBHOOK_SECRET    signs webhook bodies (set in Razorpay dashboard)
//
//   SABPAISA_CLIENT_CODE, SABPAISA_USERNAME, SABPAISA_PASSWORD
//   SABPAISA_AUTH_KEY          AES-256 key, base64 (Sabpaisa calls it authKey)
//   SABPAISA_AUTH_IV           HMAC-SHA384 key, base64 (Sabpaisa calls it authIV)
//   SABPAISA_ENV               'live' (default) or 'staging'
//   SABPAISA_MCC               merchant category code from the Sabpaisa account
//
//   GOOGLE_SERVICE_ACCOUNT_JSON  already used by verify-play-receipt
//   GOOGLE_PLAY_PACKAGE_NAME     defaults to com.cloudlynk.app
//   PAYMENT_GST_PERCENT          % of the price that is GST, for the report to
//                                Google (default 0 -- set 18 if registered)

import { getAccessToken } from "./google-auth.ts";

const enc = new TextEncoder();
const dec = new TextDecoder();

function toHex(bytes: Uint8Array<ArrayBuffer>): string {
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Uint8Array<ArrayBuffer> {
  const clean = hex.trim();
  if (clean.length % 2 !== 0 || /[^0-9a-fA-F]/.test(clean)) throw new Error("Invalid hex");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
  return out;
}

function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(b64.trim()), c => c.charCodeAt(0));
}

/** Constant-time comparison, so a signature check cannot be timed. */
function safeEqual(a: Uint8Array<ArrayBuffer>, b: Uint8Array<ArrayBuffer>): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function hmac(hash: "SHA-256" | "SHA-384", key: Uint8Array<ArrayBuffer>, data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, data));
}

// ── Razorpay ────────────────────────────────────────────────────────────────

export function razorpayConfigured(): boolean {
  return !!(Deno.env.get("RAZORPAY_KEY_ID") && Deno.env.get("RAZORPAY_KEY_SECRET"));
}

export function razorpayKeyId(): string {
  return Deno.env.get("RAZORPAY_KEY_ID") ?? "";
}

async function razorpayFetch(path: string, init: RequestInit = {}): Promise<any> {
  const id = Deno.env.get("RAZORPAY_KEY_ID") ?? "";
  const secret = Deno.env.get("RAZORPAY_KEY_SECRET") ?? "";
  const res = await fetch(`https://api.razorpay.com/v1${path}`, {
    ...init,
    headers: {
      "Authorization": `Basic ${btoa(`${id}:${secret}`)}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Razorpay ${path}: ${json?.error?.description ?? res.status}`);
  }
  return json;
}

export async function razorpayCreateOrder(
  orderId: string, amountInr: number, notes: Record<string, string>,
): Promise<{ id: string }> {
  return razorpayFetch("/orders", {
    method: "POST",
    body: JSON.stringify({
      amount: amountInr * 100,
      currency: "INR",
      receipt: orderId,
      notes,
    }),
  });
}

/** The signature Razorpay's checkout hands the app: HMAC(order_id|payment_id). */
export async function razorpayCheckoutSignatureValid(
  providerOrderId: string, paymentId: string, signature: string,
): Promise<boolean> {
  const secret = Deno.env.get("RAZORPAY_KEY_SECRET") ?? "";
  try {
    const expected = await hmac("SHA-256", enc.encode(secret), enc.encode(`${providerOrderId}|${paymentId}`));
    return safeEqual(expected, fromHex(signature));
  } catch {
    return false;
  }
}

export async function razorpayWebhookSignatureValid(rawBody: string, signature: string | null): Promise<boolean> {
  const secret = Deno.env.get("RAZORPAY_WEBHOOK_SECRET") ?? "";
  if (!secret || !signature) return false;
  try {
    const expected = await hmac("SHA-256", enc.encode(secret), enc.encode(rawBody));
    return safeEqual(expected, fromHex(signature));
  } catch {
    return false;
  }
}

export interface RazorpayPayment {
  id: string;
  order_id: string;
  status: string; // created | authorized | captured | refunded | failed
  amount: number; // paise
  currency: string;
  method?: string;
  error_description?: string | null;
}

export async function razorpayGetPayment(paymentId: string): Promise<RazorpayPayment> {
  return razorpayFetch(`/payments/${encodeURIComponent(paymentId)}`);
}

export async function razorpayCapture(paymentId: string, amountPaise: number): Promise<RazorpayPayment> {
  return razorpayFetch(`/payments/${encodeURIComponent(paymentId)}/capture`, {
    method: "POST",
    body: JSON.stringify({ amount: amountPaise, currency: "INR" }),
  });
}

export async function razorpayOrderPayments(providerOrderId: string): Promise<RazorpayPayment[]> {
  const json = await razorpayFetch(`/orders/${encodeURIComponent(providerOrderId)}/payments`);
  return (json?.items ?? []) as RazorpayPayment[];
}

// ── Sabpaisa ────────────────────────────────────────────────────────────────
//
// Format taken from Sabpaisa's official Node.js sample (bitbucket
// sabpaisa-wp-29/nodejs-2.0, request.js): AES-256-GCM with a 12-byte IV and a
// 16-byte tag, then HMAC-SHA384 over (iv || ciphertext || tag), sent as
// uppercase hex of (hmac || iv || ciphertext || tag). WebCrypto's AES-GCM
// output is ciphertext || tag, which is exactly the layout needed.

export function sabpaisaConfigured(): boolean {
  return ["SABPAISA_CLIENT_CODE", "SABPAISA_USERNAME", "SABPAISA_PASSWORD", "SABPAISA_AUTH_KEY", "SABPAISA_AUTH_IV"]
    .every(k => !!Deno.env.get(k));
}

function sabpaisaLive(): boolean {
  return (Deno.env.get("SABPAISA_ENV") ?? "live").toLowerCase() !== "staging";
}

export function sabpaisaInitUrl(): string {
  return sabpaisaLive()
    ? "https://securepay.sabpaisa.in/SabPaisa/sabPaisaInit?v=1"
    : "https://stage-securepay.sabpaisa.in/SabPaisa/sabPaisaInit?v=1";
}

function sabpaisaEnquiryUrl(): string {
  return sabpaisaLive()
    ? "https://txnenquiry.sabpaisa.in/SPTxtnEnquiry/getTxnStatusByClientxnId"
    : "https://stage-txnenquiry.sabpaisa.in/SPTxtnEnquiry/getTxnStatusByClientxnId";
}

export function sabpaisaClientCode(): string {
  return Deno.env.get("SABPAISA_CLIENT_CODE") ?? "";
}

export async function sabpaisaEncrypt(plaintext: string): Promise<string> {
  const aesKey = await crypto.subtle.importKey(
    "raw", fromBase64(Deno.env.get("SABPAISA_AUTH_KEY") ?? ""), { name: "AES-GCM" }, false, ["encrypt"],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ctAndTag = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv, tagLength: 128 }, aesKey, enc.encode(plaintext)),
  );
  const message = new Uint8Array(iv.length + ctAndTag.length);
  message.set(iv, 0);
  message.set(ctAndTag, iv.length);
  const mac = await hmac("SHA-384", fromBase64(Deno.env.get("SABPAISA_AUTH_IV") ?? ""), message);
  const out = new Uint8Array(mac.length + message.length);
  out.set(mac, 0);
  out.set(message, mac.length);
  return toHex(out).toUpperCase();
}

/** Decrypts and authenticates. Throws if the HMAC does not match -- i.e. the
 *  payload did not come from Sabpaisa or was altered on the way. */
export async function sabpaisaDecrypt(hexCipher: string): Promise<string> {
  const full = fromHex(hexCipher);
  if (full.length < 48 + 12 + 16) throw new Error("Sabpaisa payload too short");
  const macReceived = full.slice(0, 48);
  const message = full.slice(48);
  const macExpected = await hmac("SHA-384", fromBase64(Deno.env.get("SABPAISA_AUTH_IV") ?? ""), message);
  if (!safeEqual(macReceived, macExpected)) throw new Error("Sabpaisa HMAC mismatch");
  const aesKey = await crypto.subtle.importKey(
    "raw", fromBase64(Deno.env.get("SABPAISA_AUTH_KEY") ?? ""), { name: "AES-GCM" }, false, ["decrypt"],
  );
  const iv = message.slice(0, 12);
  const ctAndTag = message.slice(12);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv, tagLength: 128 }, aesKey, ctAndTag);
  return dec.decode(plain);
}

/** Sabpaisa's `a=1&b=2` response format. Values are not URL-encoded. */
export function parseSabpaisa(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of text.split("&")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i)] = part.slice(i + 1);
  }
  return out;
}

/** Sabpaisa wants the transaction date in IST, "YYYY-MM-DD HH:mm:ss". */
function istNow(): string {
  const d = new Date(Date.now() + 5.5 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

/** Sabpaisa's form fields cannot carry '&' or '=' -- they would split the
 *  unencoded key=value string. Strip them from anything user-supplied. */
function sp(v: string): string {
  return v.replace(/[&=]/g, " ").trim();
}

export async function sabpaisaBuildRequest(args: {
  clientTxnId: string;
  amountInr: number;
  payerName: string;
  payerEmail: string;
  payerMobile: string;
  callbackUrl: string;
}): Promise<{ url: string; encData: string; clientCode: string }> {
  const clientCode = sabpaisaClientCode();
  const fields = [
    `payerName=${sp(args.payerName)}`,
    `payerEmail=${sp(args.payerEmail)}`,
    `payerMobile=${sp(args.payerMobile)}`,
    `clientTxnId=${args.clientTxnId}`,
    `amount=${args.amountInr}`,
    `clientCode=${clientCode}`,
    `transUserName=${Deno.env.get("SABPAISA_USERNAME") ?? ""}`,
    `transUserPassword=${Deno.env.get("SABPAISA_PASSWORD") ?? ""}`,
    `callbackUrl=${args.callbackUrl}`,
    `channelId=M`,
    `mcc=${Deno.env.get("SABPAISA_MCC") ?? "5815"}`,
    `transDate=${istNow()}`,
    `amountType=INR`,
  ];
  return { url: sabpaisaInitUrl(), encData: await sabpaisaEncrypt(fields.join("&")), clientCode };
}

export async function sabpaisaEnquire(clientTxnId: string): Promise<Record<string, string>> {
  const clientCode = sabpaisaClientCode();
  const statusTransEncData = await sabpaisaEncrypt(`clientCode=${clientCode}&clientTxnId=${clientTxnId}`);
  const res = await fetch(sabpaisaEnquiryUrl(), {
    method: "POST",
    headers: { "Accept": "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ clientCode, statusTransEncData }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.statusResponseData) throw new Error(`Sabpaisa enquiry failed (${res.status})`);
  return parseSabpaisa(await sabpaisaDecrypt(json.statusResponseData));
}

// ── Google Play: report an alternative-billing sale ─────────────────────────
//
// Required by user choice billing: every sale completed outside Google Play
// Billing must be reported within 24 hours, with the token the device got
// from Google's choice screen. Recorded as a one-time transaction, because
// what the gateways sell is a fixed-length pass, not an auto-renewing plan.

export async function reportExternalTransaction(args: {
  externalTransactionId: string;
  externalTransactionToken: string;
  amountInr: number;
  transactionTime: string;
}): Promise<void> {
  const pkg = Deno.env.get("GOOGLE_PLAY_PACKAGE_NAME") ?? "com.cloudlynk.app";
  const gstPercent = Number(Deno.env.get("PAYMENT_GST_PERCENT") ?? "0") || 0;
  const totalMicros = BigInt(args.amountInr) * 1_000_000n;
  const preTaxMicros = gstPercent > 0
    ? BigInt(Math.round((args.amountInr / (1 + gstPercent / 100)) * 1_000_000))
    : totalMicros;
  const taxMicros = totalMicros - preTaxMicros;

  const token = await getAccessToken();
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${pkg}` +
    `/externalTransactions?externalTransactionId=${encodeURIComponent(args.externalTransactionId)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      originalPreTaxAmount: { priceMicros: preTaxMicros.toString(), currency: "INR" },
      originalTaxAmount: { priceMicros: taxMicros.toString(), currency: "INR" },
      transactionTime: args.transactionTime,
      oneTimeTransaction: { externalTransactionToken: args.externalTransactionToken },
      userTaxAddress: { regionCode: "IN" },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    // 409: already reported under this id -- that is success for our purposes.
    if (res.status === 409) return;
    throw new Error(`Google external transaction report failed (${res.status}): ${body.slice(0, 300)}`);
  }
}
