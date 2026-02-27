/// <reference lib="deno.ns" />
/// <reference lib="dom" />

const EMAILJS_SERVICE_ID = Deno.env.get("EMAILJS_SERVICE_ID") ?? "";
const EMAILJS_TEMPLATE_ID = Deno.env.get("EMAILJS_TEMPLATE_ID") ?? "";
const EMAILJS_PUBLIC_KEY = Deno.env.get("EMAILJS_PUBLIC_KEY") ?? "";
const EMAILJS_PRIVATE_KEY = Deno.env.get("EMAILJS_PRIVATE_KEY") ?? "";
const ADMIN_EMAIL = Deno.env.get("ADMIN_EMAIL") ?? "";

const EMAILJS_ENDPOINT = "https://api.emailjs.com/api/v1.0/email/send";

type BookingPayload = {
  court_id?: string;
  plan?: string;
  start_date?: string;
  end_date?: string;
  start_time?: string | null;
  total_amount?: number | string;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  event_type?: string | null;
  notes?: string | null;
};

const getRecord = (payload: Record<string, unknown>) => {
  if ("record" in payload && payload.record) return payload.record as BookingPayload;
  if ("new" in payload && payload.new) return payload.new as BookingPayload;
  if ("data" in payload && payload.data) return payload.data as BookingPayload;
  return payload as BookingPayload;
};

const formatAmount = (value?: number | string) => {
  if (value === undefined || value === null) return "N/A";
  if (typeof value === "number") return `NGN ${value.toLocaleString("en-NG")}`;
  return value;
};

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  if (
    !EMAILJS_SERVICE_ID ||
    !EMAILJS_TEMPLATE_ID ||
    !EMAILJS_PUBLIC_KEY ||
    !ADMIN_EMAIL
  ) {
    return new Response(
      "Missing EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, EMAILJS_PUBLIC_KEY, or ADMIN_EMAIL",
      { status: 500 },
    );
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = (await req.json()) as Record<string, unknown>;
  } catch {
    payload = {};
  }

  const record = getRecord(payload);
  const dateLabel =
    record.plan === "Hourly"
      ? `${record.start_date ?? ""}${record.start_time ? ` at ${record.start_time}` : ""}`
      : `${record.start_date ?? ""}${record.end_date ? ` to ${record.end_date}` : ""}`;

  const response = await fetch(EMAILJS_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      service_id: EMAILJS_SERVICE_ID,
      template_id: EMAILJS_TEMPLATE_ID,
      user_id: EMAILJS_PUBLIC_KEY,
      accessToken: EMAILJS_PRIVATE_KEY || undefined,
      template_params: {
        admin_email: ADMIN_EMAIL,
        to_email: ADMIN_EMAIL,
        customer_name: record.customer_name ?? "New customer",
        customer_email: record.customer_email ?? "N/A",
        customer_phone: record.customer_phone ?? "N/A",
        court_id: record.court_id ?? "N/A",
        plan: record.plan ?? "N/A",
        date_label: dateLabel || "N/A",
        total_amount: formatAmount(record.total_amount),
        event_type: record.event_type ?? "N/A",
        notes: record.notes ?? "",
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return new Response(errorText, { status: 500 });
  }

  return new Response("ok", { status: 200 });
});
