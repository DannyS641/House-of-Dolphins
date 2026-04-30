import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import emailjs from "@emailjs/nodejs";

const TABLE_NAME = "bookings";
const COMPANY_NAME = "House of Dolphins";
const COMPANY_LOCATION = "Lagos, Nigeria";
const BOOKING_SELECT =
  "id,court_id,plan,start_date,end_date,start_time,hours,total_amount,customer_name,customer_phone,customer_email,event_type,notes,status";

function getEnv(name, fallbackName) {
  return process.env[name] || (fallbackName ? process.env[fallbackName] : "");
}

function getErrorMessage(error) {
  return error instanceof Error ? error.message : "Unknown error.";
}

function createSupabaseClient() {
  const supabaseUrl = getEnv("SUPABASE_URL", "VITE_SUPABASE_URL");
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase environment variables are missing.");
  }

  return createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  });
}

function formatAmount(value) {
  const amount = Number(value || 0);
  return `NGN ${amount.toLocaleString("en-NG")}`;
}

function getDateLabel(booking) {
  if (booking.plan === "Hourly") {
    return `${booking.start_date}${booking.start_time ? ` at ${booking.start_time}` : ""}`;
  }

  if (booking.end_date && booking.end_date !== booking.start_date) {
    return `${booking.start_date} to ${booking.end_date}`;
  }

  return booking.start_date;
}

function buildStatusEmail(booking) {
  const statusLabel = booking.status === "confirmed" ? "approved" : "rejected";
  const dateLabel = getDateLabel(booking);
  const total = formatAmount(booking.total_amount);

  return {
    subject: `${COMPANY_NAME} booking ${statusLabel}`,
    text: [
      `Hi ${booking.customer_name},`,
      "",
      `Your booking has been ${statusLabel}.`,
      "",
      `Court: ${booking.court_id}`,
      `Plan: ${booking.plan}`,
      `Date: ${dateLabel}`,
      `Total: ${total}`,
      "",
      `Location: ${COMPANY_LOCATION}`,
    ].join("\n"),
    html: `
      <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.6;">
        <p>Hi ${booking.customer_name},</p>
        <p>Your booking has been <strong>${statusLabel}</strong>.</p>
        <div style="margin: 16px 0; padding: 12px 16px; background: #f4f0e8; border-radius: 12px;">
          <p style="margin: 0 0 8px;"><strong>Booking details</strong></p>
          <p style="margin: 0;">Court: ${booking.court_id}</p>
          <p style="margin: 0;">Plan: ${booking.plan}</p>
          <p style="margin: 0;">Date: ${dateLabel}</p>
          <p style="margin: 0;">Total: ${total}</p>
        </div>
        <p>Location: ${COMPANY_LOCATION}</p>
      </div>
    `,
  };
}

async function sendEmail({ to, subject, text, html, templateParams }) {
  const emailProvider = (process.env.EMAIL_PROVIDER || "auto").toLowerCase();
  const resendKey = process.env.RESEND_API_KEY;
  const resendFrom = process.env.RESEND_FROM_EMAIL;
  const emailJsConfig = {
    serviceId: process.env.EMAILJS_SERVICE_ID,
    templateId: process.env.EMAILJS_TEMPLATE_ID,
    publicKey: process.env.EMAILJS_PUBLIC_KEY,
    privateKey: process.env.EMAILJS_PRIVATE_KEY,
  };

  if (
    (emailProvider === "auto" || emailProvider === "resend") &&
    resendKey &&
    resendFrom
  ) {
    const resend = new Resend(resendKey);
    const result = await resend.emails.send({
      from: resendFrom,
      to,
      subject,
      text,
      html,
    });

    if (result.error) {
      throw new Error(result.error.message || "Resend email failed.");
    }

    return { sent: true, provider: "resend", id: result.data?.id };
  }

  if (
    (emailProvider === "auto" || emailProvider === "emailjs") &&
    emailJsConfig.serviceId &&
    emailJsConfig.templateId &&
    emailJsConfig.publicKey &&
    emailJsConfig.privateKey
  ) {
    await emailjs.send(
      emailJsConfig.serviceId,
      emailJsConfig.templateId,
      { to_email: to, subject, message: text, ...templateParams },
      {
        publicKey: emailJsConfig.publicKey,
        privateKey: emailJsConfig.privateKey,
      },
    );
    return { sent: true, provider: "emailjs" };
  }

  return { sent: false, provider: "none" };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  try {
    const { bookingId, status } = req.body || {};

    if (!bookingId || !["confirmed", "rejected"].includes(status)) {
      return res.status(400).json({ error: "Invalid status update." });
    }

    const authHeader = req.headers.authorization || "";
    const accessToken = authHeader.replace(/^Bearer\s+/i, "");
    const supabase = createSupabaseClient();

    if (!accessToken) {
      return res.status(401).json({ error: "Missing admin session." });
    }

    const userResponse = await supabase.auth.getUser(accessToken);
    if (userResponse.error || !userResponse.data.user) {
      return res.status(401).json({ error: "Invalid admin session." });
    }

    const { data, error } = await supabase
      .from(TABLE_NAME)
      .update({ status })
      .eq("id", bookingId)
      .select(BOOKING_SELECT)
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    let emailResult = { sent: false, provider: "none" };
    let emailError = "";

    if (data?.customer_email) {
      try {
        emailResult = await sendEmail({
          to: data.customer_email,
          ...buildStatusEmail(data),
          templateParams: {
            to_name: data.customer_name,
            customer_name: data.customer_name,
            booking_status: status,
          },
        });
      } catch (error) {
        emailError = getErrorMessage(error);
        console.error("Booking status email failed:", emailError);
        emailResult = { sent: false, provider: "error" };
      }
    }

    return res.status(200).json({
      ok: true,
      booking: data,
      emailSent: emailResult.sent,
      emailResult,
      emailError,
    });
  } catch (error) {
    return res.status(500).json({ error: getErrorMessage(error) });
  }
}
