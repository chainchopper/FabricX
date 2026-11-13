import nodemailer from "nodemailer";

// Alert notification channels (spec §4.4): email + one webhook, both behind
// env config. notifyAlert reports per-channel truth: a channel that is not
// configured is "not configured", never silently "sent".

export interface ChannelResult {
  channel: "email" | "webhook";
  configured: boolean;
  sent: boolean;
  detail: string;
}

export interface AlertNotice {
  alertId: string;
  endpointLabel: string;
  routeId: string | null;
  routeLabel: string | null;
  reason: string;
}

function webhookUrl(): string | null {
  return process.env.ALERT_WEBHOOK_URL || null;
}

function smtpConfigured(): boolean {
  return !!(process.env.SMTP_URL || process.env.SMTP_HOST);
}

export async function notifyAlert(notice: AlertNotice): Promise<ChannelResult[]> {
  const results: ChannelResult[] = [];
  const text =
    `Fabric Admin alert: ${notice.routeLabel ?? notice.endpointLabel}` +
    (notice.routeId ? ` (route ${notice.routeId})` : "") +
    ` — endpoint "${notice.endpointLabel}" failing. Reason: ${notice.reason}`;

  // Webhook channel.
  const url = webhookUrl();
  if (!url) {
    results.push({
      channel: "webhook",
      configured: false,
      sent: false,
      detail: "ALERT_WEBHOOK_URL not set",
    });
  } else {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "fabric_admin_alert",
          alert_id: notice.alertId,
          route_id: notice.routeId,
          route_label: notice.routeLabel,
          endpoint_label: notice.endpointLabel,
          reason: notice.reason,
          text,
          at: new Date().toISOString(),
        }),
      });
      results.push({
        channel: "webhook",
        configured: true,
        sent: r.ok,
        detail: `webhook responded HTTP ${r.status}`,
      });
    } catch (e) {
      results.push({
        channel: "webhook",
        configured: true,
        sent: false,
        detail: `webhook delivery failed: ${(e as Error).message}`,
      });
    }
  }

  // Email channel.
  const to = process.env.ALERT_EMAIL_TO || process.env.ADMIN_EMAIL || null;
  if (!smtpConfigured() || !to) {
    results.push({
      channel: "email",
      configured: false,
      sent: false,
      detail: !smtpConfigured()
        ? "SMTP_URL/SMTP_HOST not set"
        : "ALERT_EMAIL_TO/ADMIN_EMAIL not set",
    });
  } else {
    try {
      const transport = process.env.SMTP_URL
        ? nodemailer.createTransport(process.env.SMTP_URL)
        : nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT ?? 587),
            secure: process.env.SMTP_SECURE === "1",
            auth:
              process.env.SMTP_USER || process.env.SMTP_PASS
                ? {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASS,
                  }
                : undefined,
          });
      await transport.sendMail({
        from: process.env.SMTP_FROM ?? "fabric-admin@fanalogy.com",
        to,
        subject: `[Fabric Admin] ${notice.routeLabel ?? "Endpoint"} failing`,
        text,
      });
      results.push({
        channel: "email",
        configured: true,
        sent: true,
        detail: `email accepted by SMTP transport for ${to}`,
      });
    } catch (e) {
      results.push({
        channel: "email",
        configured: true,
        sent: false,
        detail: `email delivery failed: ${(e as Error).message}`,
      });
    }
  }

  return results;
}
