# Mailgun integration for Gladys Assistant

Send your Gladys notifications by email through [Mailgun](https://www.mailgun.com/), send emails
from your scenes, and start scenes when an email is delivered, fails, is opened or clicked.

Mailgun is a **cloud** service: Gladys needs Internet access to send emails.

## What you need

- A Mailgun account (the free plan is enough to start).
- A **sending domain** in Mailgun, e.g. `mg.example.com`. The sandbox domain Mailgun creates for
  you works too, but it only sends to the "authorized recipients" of your account.
- An **API key**:
  - a **domain sending key** (Mailgun → _Sending_ → _Domain settings_ → _Sending keys_) is enough
    to send emails;
  - the **private API key** (Mailgun → _API keys_) is needed for the statistics of the widget and
    to register the webhooks automatically.
- The **region** of your account: US (`api.mailgun.net`) or EU (`api.eu.mailgun.net`). A domain
  created in the EU region does not exist for the US API.
- Optional: **Gladys Plus**, to receive the Mailgun events (delivered, failed, opened…) and start
  scenes with them.

## Configuration

In Gladys: **Integrations** → **Mailgun** → **Configuration**.

| Field                                          | What to fill in                                                              |
| ---------------------------------------------- | ---------------------------------------------------------------------------- |
| Mailgun API key                                | The sending key or the private API key.                                      |
| Sending domain                                 | The domain as listed in Mailgun, e.g. `mg.example.com`.                      |
| Account region                                 | United States or Europe.                                                     |
| Sender name                                    | The name shown in the inbox. Default: `Gladys`.                              |
| Sender address                                 | An address of the sending domain. Empty: `gladys@<your domain>`.             |
| Subject of notifications                       | Subject of the notification emails. Default: `Gladys`.                       |
| Also send an HTML version                      | Clickable links and the camera image in the email. On by default.            |
| Sending cap (emails per hour)                  | Past this number, emails are refused until the hour has passed. Default: 60. |
| Register the webhooks in Mailgun automatically | See [Mailgun events](#mailgun-events-scene-triggers). On by default.         |
| HTTP webhook signing key                       | From the Mailgun _Webhooks_ page. Strongly advised when you use the events.  |

Click **Test the connection**: the answer tells whether the domain is known and active. Then
**Send a test email** to your own address.

### My account (each user)

Each Gladys user enters **their own email address** in the **My account** block of the same
screen. Gladys sends that user's notifications to that address. A user without an address
receives no email.

## Notifications

Once your address is filled in, every notification Gladys sends you (alarm, scenes "Send a
message", camera image…) also arrives by email. The camera image is shown inside the email when
the HTML version is on.

## Scene action: "Send an email"

In a scene, add the action **Integrations** → **Mailgun** → **Send an email**:

| Field        | Description                                                        |
| ------------ | ------------------------------------------------------------------ |
| To           | One or more addresses, separated by commas (20 at most).           |
| Subject      | Subject of the email.                                              |
| Message      | Text of the email.                                                 |
| Cc / Bcc     | Optional copies.                                                   |
| Reply to     | Optional reply address.                                            |
| Mailgun tags | Up to 3, separated by commas. Useful to filter the triggers below. |

Scene variables (`{{...}}`) work in every field. The action returns:

- `sent`: `true` when Mailgun accepted the email;
- `message_id`: the Mailgun id of the email;
- `error`: why the email was not sent (empty otherwise).

The action never stops the scene: check `sent` in a condition if the next actions depend on it.

## Mailgun events (scene triggers)

Mailgun can tell Gladys what happens to the emails. Mailgun must reach your Gladys from the
Internet, so this goes through **Gladys Plus**:

1. In the Mailgun configuration screen, paste your **Gladys Plus Open API key** in the
   **Gladys Plus webhooks** block.
2. Keep **Register the webhooks in Mailgun automatically** on (needs the private API key), or
   click **Register the Mailgun webhooks**. The integration adds its URL next to the URLs you may
   already have; Mailgun accepts 3 URLs per event.
3. In Mailgun, open **Sending** → **Webhooks**, copy the **HTTP webhook signing key** and paste it
   in **HTTP webhook signing key**. With it, only events really signed by Mailgun start your
   scenes.

The triggers, in **Integrations** → **Mailgun**:

| Trigger                      | Key                  | When                                                   |
| ---------------------------- | -------------------- | ------------------------------------------------------ |
| An email is delivered        | `email_delivered`    | The recipient's server accepted the email.             |
| An email fails               | `email_failed`       | Mailgun could not deliver it (permanent or temporary). |
| An email is opened           | `email_opened`       | The recipient opened it (open tracking must be on).    |
| A link is clicked            | `email_clicked`      | A link was clicked (click tracking must be on).        |
| An email is reported as spam | `email_complained`   | The recipient marked it as spam.                       |
| A recipient unsubscribes     | `email_unsubscribed` | The recipient used the unsubscribe link.               |

Each trigger can be filtered on the **recipient** and the **tag** (empty = any). "An email fails"
can also be filtered on the **kind of failure** (permanent, temporary).

Variables available in the next actions: `{{triggerEvent.data.recipient}}`,
`{{triggerEvent.data.subject}}`, `{{triggerEvent.data.tag}}`, `{{triggerEvent.data.message_id}}`,
plus `severity` and `reason` for a failure and `url` for a click.

> Avoid a scene "when an email fails, send an email to the same address": it can loop. The sending
> cap stops it, but your Mailgun quota still suffers.

## Dashboard widgets

- **Mailgun activity**: emails sent, delivered, failed and opened over 24 hours, 7 or 30 days, a
  chart, the domain state, the state of the events, how many emails Gladys sent in the last hour
  against the cap, and the buttons **Send a test email** and **Refresh**. The statistics need the
  private API key.
- **Mailgun events**: the last events received (needs Gladys Plus). Setting: how many to show,
  and all events or problems only (failures, spam reports, unsubscriptions).

## Troubleshooting

| Message                                  | What to do                                                             |
| ---------------------------------------- | ---------------------------------------------------------------------- |
| "Mailgun refused the API key"            | Check the key. A sending key only works for its own domain.            |
| "Mailgun does not know this domain"      | Check the spelling, and the **region** (US/EU) of the account.         |
| "domain … is unverified"                 | Add the DNS records Mailgun shows for the domain, then verify it.      |
| "Sending cap reached"                    | A scene sends too much. Fix it, or raise the cap.                      |
| The events never arrive                  | Check Gladys Plus, then click **Register the Mailgun webhooks**.       |
| Events refused in the logs (`signature`) | The signing key does not match the one of the Mailgun _Webhooks_ page. |

The integration logs (Gladys → Integrations → Mailgun → logs) give more details. They never show
the API key, and addresses are shortened (`a***@example.com`).

## Privacy

- The API key and the signing key stay in the Gladys configuration.
- The integration keeps, in its own `/data` folder, the last 20 events received (recipient,
  subject, date) for the widget, and the time of the emails sent in the last 24 hours for the
  sending cap. Nothing else.
