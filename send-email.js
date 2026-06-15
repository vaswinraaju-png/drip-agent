import nodemailer from "nodemailer";
import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { gmailUser, gmailPass, supabaseUrl, supabaseKey, prospect, emailData } = req.body;

  try {
    // Send email
    const mailer = nodemailer.createTransport({
      service: "gmail",
      auth: { user: gmailUser, pass: gmailPass },
    });

    await mailer.sendMail({
      from: `Aswin Raaju <${gmailUser}>`,
      to: prospect.contact_email,
      subject: emailData.subject,
      text: emailData.body,
    });

    // Log to Supabase
    if (supabaseUrl && supabaseKey) {
      const supabase = createClient(supabaseUrl, supabaseKey);
      await supabase.from("prospects").insert({
        url: prospect.url,
        business_name: prospect.business_name,
        contact_email: prospect.contact_email,
        niche: prospect.niche,
        email_sent: true,
        email_subject: emailData.subject,
        sent_at: new Date().toISOString(),
        status: "sent",
      });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
