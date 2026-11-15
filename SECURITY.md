# Security policy

## Supported versions

Only the latest release of the Mailgun integration receives security fixes.
Update the integration from the Gladys store before reporting an issue.

| Version | Supported |
| ------- | --------- |
| latest  | Yes       |
| older   | No        |

## Reporting a vulnerability

Please do **not** open a public issue for a security problem.

Report it privately through GitHub: open the **Security** tab of
[prohand/gladys-mailgun](https://github.com/prohand/gladys-mailgun/security), then
**Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only asks the
maintainers for a private contact, without any detail of the problem, and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- any log line that helps (remove API keys, signing keys, tokens and email addresses first).

You should get a first answer within 7 days. A fix is released as a new version of
the integration, and the advisory is published once users can update.

## Scope

In scope: the code of this repository and the Docker image it publishes — in particular the
handling of the Mailgun API key, the verification of the webhook signatures, the email headers
built from user or scene input, and the sending cap.

Out of scope: Gladys Assistant itself (report to
[GladysAssistant/Gladys](https://github.com/GladysAssistant/Gladys/security)), Gladys Plus, and
Mailgun itself (report to [Mailgun](https://www.mailgun.com/security/)).

## Good practices for users

- Prefer a **domain sending key** over the private API key when you do not need the widget
  statistics nor the automatic webhook registration: it can only send for one domain.
- Fill in the **HTTP webhook signing key**: without it, anyone who learns the Gladys Plus webhook
  URL can start your Mailgun scenes.
- Keep the **sending cap** low enough for your use: it limits the damage of a scene that loops.
- Keep Gladys and the integration up to date.
