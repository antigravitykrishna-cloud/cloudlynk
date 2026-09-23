// Meta Conversions API: report a confirmed gateway purchase to Meta.
//
// Secrets (Supabase function secrets):
//   META_DATASET_ID       the dataset / pixel ID from Meta Events Manager
//   META_CAPI_TOKEN       a Conversions API access token for that dataset
//   META_TEST_EVENT_CODE  optional -- set while testing so events show under
//                         "Test events" in Events Manager; remove for live
//   META_GRAPH_VERSION    optional, defaults to v23.0
//
// Sent as an app event (action_source "app") matched to the phone by the
// Meta anonymous ID / advertising ID the app attached to the order, plus the
// buyer's email, SHA-256 hashed as Meta requires -- the plain address never
// leaves our server. event_id is the order id, so Meta drops a repeat.

export function metaConfigured(): boolean {
  return !!(Deno.env.get("META_DATASET_ID") && Deno.env.get("META_CAPI_TOKEN"));
}

async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d), b => b.toString(16).padStart(2, "0")).join("");
}

export interface MetaDevice {
  anonId?: string | null;
  advertiserId?: string | null;
  extinfo?: string[];
}

/** Keeps only the fields Meta uses, with sane sizes -- this came from a phone. */
export function cleanMetaDevice(raw: unknown): MetaDevice | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const str = (v: unknown, max: number) => (typeof v === "string" && v.length > 0 ? v.slice(0, max) : null);
  const extinfo = Array.isArray(r.extinfo)
    ? r.extinfo.slice(0, 16).map(v => (typeof v === "string" ? v.slice(0, 64) : ""))
    : [];
  while (extinfo.length < 16) extinfo.push("");
  extinfo[0] = "a2"; // Android
  const out: MetaDevice = { anonId: str(r.anonId, 128), advertiserId: str(r.advertiserId, 64), extinfo };
  return out.anonId || out.advertiserId ? out : null;
}

export async function sendMetaPurchase(args: {
  orderId: string;
  email: string | null;
  amountInr: number;
  planCode: string;
  paidAt: string;
  device: MetaDevice;
}): Promise<void> {
  const dataset = Deno.env.get("META_DATASET_ID") ?? "";
  const token = Deno.env.get("META_CAPI_TOKEN") ?? "";
  const version = Deno.env.get("META_GRAPH_VERSION") ?? "v23.0";
  const testCode = Deno.env.get("META_TEST_EVENT_CODE");

  const userData: Record<string, unknown> = {};
  if (args.email) userData.em = [await sha256Hex(args.email.trim().toLowerCase())];
  if (args.device.anonId) userData.anon_id = args.device.anonId;
  if (args.device.advertiserId) userData.madid = args.device.advertiserId;

  const body: Record<string, unknown> = {
    data: [{
      event_name: "Purchase",
      event_time: Math.floor(new Date(args.paidAt).getTime() / 1000),
      event_id: args.orderId,
      action_source: "app",
      user_data: userData,
      app_data: {
        advertiser_tracking_enabled: 1,
        application_tracking_enabled: 1,
        extinfo: args.device.extinfo,
      },
      custom_data: {
        currency: "INR",
        value: args.amountInr,
        content_ids: [args.planCode],
        content_type: "product",
        order_id: args.orderId,
      },
    }],
  };
  if (testCode) body.test_event_code = testCode;

  const res = await fetch(
    `https://graph.facebook.com/${version}/${encodeURIComponent(dataset)}/events?access_token=${encodeURIComponent(token)}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Meta Conversions API ${res.status}: ${text.slice(0, 300)}`);
  }
}
