import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import emailjs from "@emailjs/nodejs";

const TABLE_NAME = "bookings";
const COMPANY_NAME = "House of Dolphins";
const COMPANY_LOCATION = "Lagos, Nigeria";

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

function buildCustomerReceivedEmail(booking) {
  const dateLabel = getDateLabel(booking);
  const total = formatAmount(booking.total_amount);

  return {
    subject: `${COMPANY_NAME} booking received`,
    text: [
      `Hi ${booking.customer_name},`,
      "",
      "Your booking has been received and is pending approval.",
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
        <p>Your booking has been received and is pending approval.</p>
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

function buildAdminEmail(booking, adminLink) {
  const dateLabel = getDateLabel(booking);
  const total = formatAmount(booking.total_amount);

  return {
    subject: `New booking from ${booking.customer_name}`,
    text: [
      "New booking received.",
      "",
      `Customer: ${booking.customer_name}`,
      `Email: ${booking.customer_email}`,
      `Phone: ${booking.customer_phone}`,
      `Court: ${booking.court_id}`,
      `Plan: ${booking.plan}`,
      `Date: ${dateLabel}`,
      `Total: ${total}`,
      booking.event_type ? `Use: ${booking.event_type}` : "",
      booking.notes ? `Notes: ${booking.notes}` : "",
      adminLink ? `Admin: ${adminLink}` : "",
    ].join("\n"),
    html: `
      <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.6;">
        <p><strong>New booking received.</strong></p>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          <tr><td style="padding: 8px; background: #f4f0e8; font-weight: bold;">Customer</td><td style="padding: 8px; background: #f4f0e8;">${booking.customer_name}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold;">Email</td><td style="padding: 8px;"><a href="mailto:${booking.customer_email}">${booking.customer_email}</a></td></tr>
          <tr><td style="padding: 8px; background: #f4f0e8; font-weight: bold;">Phone</td><td style="padding: 8px; background: #f4f0e8;">${booking.customer_phone}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold;">Court</td><td style="padding: 8px;">${booking.court_id}</td></tr>
          <tr><td style="padding: 8px; background: #f4f0e8; font-weight: bold;">Plan</td><td style="padding: 8px; background: #f4f0e8;">${booking.plan}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold;">Date</td><td style="padding: 8px;">${dateLabel}</td></tr>
          <tr><td style="padding: 8px; background: #f4f0e8; font-weight: bold;">Total</td><td style="padding: 8px; background: #f4f0e8;">${total}</td></tr>
        </table>
        ${adminLink ? `<p><a href="${adminLink}">Open admin dashboard</a></p>` : ""}
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
    const booking = req.body || {};

    if (
      !booking.customer_name ||
      !booking.customer_email ||
      !booking.customer_phone ||
      !booking.court_id ||
      !booking.plan ||
      !booking.start_date
    ) {
      return res.status(400).json({ error: "Missing required booking fields." });
    }

    const supabase = createSupabaseClient();
    const response = await supabase
      .from(TABLE_NAME)
      .insert([{ ...booking, status: "pending" }])
      .select("id")
      .single();

    if (response.error) {
      return res.status(500).json({ error: response.error.message });
    }

    let customerEmailResult = { sent: false, provider: "none" };
    let adminEmailResult = { sent: false, provider: "none" };
    let customerEmailError = "";
    let adminEmailError = "";
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminLink = process.env.ADMIN_LINK || "";
    const customerEmail = buildCustomerReceivedEmail(booking);
    const adminNotification = buildAdminEmail(booking, adminLink);

    try {
      customerEmailResult = await sendEmail({
        to: booking.customer_email,
        ...customerEmail,
        templateParams: {
          to_name: booking.customer_name,
          customer_name: booking.customer_name,
          booking_status: "pending",
        },
      });
    } catch (error) {
      customerEmailError = getErrorMessage(error);
      console.error("Customer booking email failed:", customerEmailError);
      customerEmailResult = { sent: false, provider: "error" };
    }

    if (adminEmail) {
      try {
        adminEmailResult = await sendEmail({
          to: adminEmail,
          ...adminNotification,
          templateParams: {
            to_name: "Admin",
            customer_name: booking.customer_name,
            customer_email: booking.customer_email,
          },
        });
      } catch (error) {
        adminEmailError = getErrorMessage(error);
        console.error("Admin booking email failed:", adminEmailError);
        adminEmailResult = { sent: false, provider: "error" };
      }
    }

    return res.status(200).json({
      ok: true,
      id: response.data?.id,
      emailSent: customerEmailResult.sent || adminEmailResult.sent,
      customerEmailSent: customerEmailResult.sent,
      adminEmailSent: adminEmailResult.sent,
      customerEmailResult,
      adminEmailResult,
      customerEmailError,
      adminEmailError,
    });
  } catch (error) {
    return res.status(500).json({ error: getErrorMessage(error) });
  }
}
