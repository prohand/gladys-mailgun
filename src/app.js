// -----------------------------------------------------------------------------
// The integration: every handler registered on the SDK instance.
//
// index.js creates the real SDK instance and calls `createApp`; the tests call
// it with the fake Gladys of the SDK and a fake `fetch`, so the whole wiring
// is tested without Gladys and without Mailgun.
//
// What it does:
//   - notification channel (manifest `type: "communication"`, send-only):
//     Gladys hands a message and a user's email address, the integration sends
//     it through Mailgun;
//   - Configuration screen buttons (manifest `actions`);
//   - scene action `send_email`, scene triggers fired by the Mailgun webhooks
//     relayed by Gladys Plus;
//   - dashboard widgets `activity` and `events`;
//   - the connection status, checked at startup, on every configuration save
//     and every 30 minutes.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from './config.js';
import { localize, pick } from './i18n.js';
import { createMailgunClient } from './mailgun/client.js';
import { checkConnection } from './mailgun/connection.js';
import { describeError, InvalidInputError } from './mailgun/errors.js';
import { WEBHOOK_IDS, parseWebhookBody, sceneEventData, toEmailEvent } from './mailgun/events.js';
import { createSendLimiter } from './mailgun/limiter.js';
import { buildMessage, maskEmail, parseRecipients } from './mailgun/message.js';
import { createSignatureVerifier } from './mailgun/signature.js';
import { createStatsReader } from './mailgun/stats.js';
import { registerWebhooks, unregisterWebhooks } from './mailgun/webhooks.js';
import { SCENE_ACTIONS, sendEmailAction } from './capabilities/scenes.js';
import {
  WIDGET_ACTIONS,
  WIDGETS,
  buildActivityWidget,
  buildEventsWidget,
} from './capabilities/widgets.js';
import { createStateStore } from './state.js';

/** Keys of the manifest `actions`. Never renamed. */
export const ACTIONS = {
  TEST_CONNECTION: 'test_connection',
  SEND_TEST_EMAIL: 'send_test_email',
  REGISTER_WEBHOOKS: 'register_webhooks',
};

/** Key of the manifest `webhooks` entry. Never renamed: Mailgun stores its URL. */
export const WEBHOOK_KEY = 'events';

/** How often the connection status is checked again. */
export const CHECK_INTERVAL_MS = 30 * 60 * 1000;

const t = (texts) => localize((language) => pick(language, texts));

/**
 * @param {import('@gladysassistant/integration-sdk').GladysIntegration} gladys
 * @param {object} [options]
 * @param {typeof fetch} [options.fetch] for the Mailgun calls
 * @param {ReturnType<typeof createStateStore>} [options.store]
 * @param {() => number} [options.now]
 * @param {object} [options.logger]
 * @param {typeof setInterval} [options.setInterval]
 * @param {typeof clearInterval} [options.clearInterval]
 */
export function createApp(gladys, options = {}) {
  const {
    fetch = globalThis.fetch,
    now = Date.now,
    logger = createLogger({ name: 'mailgun' }),
    store = createStateStore({ logger }),
    setInterval: startTimer = setInterval,
    clearInterval: stopTimer = clearInterval,
  } = options;

  let config = normalizeConfig();
  let client = null;
  let limiter = createSendLimiter({ now });
  let domain = null; // last checkConnection result
  let sendingWorks = false; // an email went through with the current key
  const webhooks = { available: false, registered: false, error: null, url: null };
  const verifier = createSignatureVerifier({ now });
  const stats = createStatsReader({ now });
  let timer = null;
  let loaded = false;
  let unsignedWarned = false;

  function applyConfig(raw) {
    config = normalizeConfig(raw);
    client = config.configured
      ? createMailgunClient({
          apiKey: config.api_key,
          domain: config.domain,
          region: config.region,
          fetch,
        })
      : null;
    stats.clear();
    sendingWorks = false;
  }

  async function loadState() {
    if (loaded) {
      return;
    }
    await store.load();
    limiter = createSendLimiter({ history: store.sent, now });
    loaded = true;
  }

  // --- Sending ---------------------------------------------------------------

  /**
   * Send one email, within the sending cap.
   *
   * @param {object} email `{ to: string[], cc?, bcc?, subject, text, replyTo?, tags?, image? }`
   * @returns {Promise<{ id: string }>}
   */
  async function sendEmail(email) {
    if (!client || !config.from) {
      throw new InvalidInputError('not configured', checkMessageNotConfigured());
    }
    const recipients = email.to.length + (email.cc?.length ?? 0) + (email.bcc?.length ?? 0);
    limiter.check(config.max_emails_per_hour, recipients);
    const message = buildMessage({
      ...email,
      from: config.from,
      html: config.html_format,
    });
    let result;
    try {
      result = await client.send(message);
    } catch (err) {
      if ([401, 403].includes(err.status)) {
        sendingWorks = false;
      }
      throw err;
    }
    limiter.record(recipients);
    if (!sendingWorks) {
      sendingWorks = true;
      // A sending key cannot read the domain: the first email that goes
      // through is what turns the connection status green.
      if (domain && !domain.ok) {
        refreshConnection().catch(() => {});
      }
    }
    await store.setSent(limiter.history());
    logger.info(
      `Email sent to ${email.to.map(maskEmail).join(', ')} (${recipients} recipient(s), id ${result.id})`,
    );
    return result;
  }

  function checkMessageNotConfigured() {
    return t({
      en: 'Fill in the Mailgun API key and the sending domain first.',
      fr: "Renseignez d'abord la clé d'API Mailgun et le domaine d'envoi.",
      de: 'Gib zuerst den Mailgun-API-Schlüssel und die Versanddomain ein.',
      es: 'Indique primero la clave de API de Mailgun y el dominio de envío.',
    });
  }

  // --- Connection status -----------------------------------------------------

  async function refreshConnection() {
    domain = await checkConnection(client, { sendingWorks });
    if (!domain.ok && domain.error) {
      logger.warn(`Mailgun check failed: ${domain.error.message}`);
    }
    await gladys.setConnectionStatus(domain.ok, domain.message).catch((err) => {
      logger.warn(`Connection status not sent: ${err.message}`);
    });
    return domain;
  }

  // --- Webhooks (Gladys Plus relay) ------------------------------------------

  /**
   * Register the Gladys Plus URL at Mailgun, or remove it when Gladys Plus was
   * unlinked. Best effort: a failure is reported, never thrown at startup.
   *
   * @param {{ available: boolean, webhooks: object[] }} [info]
   * @param {object} [opts]
   * @param {boolean} [opts.force] register even when auto-registration is off
   * @param {boolean} [opts.cleanup] remove the old URL when Gladys Plus is gone.
   *   Only on an explicit change (onWebhookUpdated, the button): at startup a
   *   Gladys Plus briefly unavailable must not unregister a working URL.
   */
  async function syncWebhooks(info, { force = false, cleanup = false } = {}) {
    const current = info ?? (await gladys.getWebhooks());
    const url = current.available
      ? (current.webhooks ?? []).find((entry) => entry.key === WEBHOOK_KEY)?.url
      : null;
    webhooks.available = Boolean(url);
    webhooks.url = url ?? null;
    webhooks.error = null;

    if (!client) {
      webhooks.registered = false;
      return null;
    }
    if (!url) {
      webhooks.registered = false;
      // Gladys Plus unlinked: the old URL now leads nowhere. Clean it up.
      if (store.webhookUrl && cleanup && (force || config.auto_register_webhooks)) {
        try {
          await unregisterWebhooks(client, store.webhookUrl);
          await store.setWebhookUrl(null);
        } catch (err) {
          logger.warn(`Old webhook URL not removed: ${err.message}`);
        }
      }
      return null;
    }
    if (!force && !config.auto_register_webhooks) {
      webhooks.registered = store.webhookUrl === url;
      return null;
    }
    try {
      const result = await registerWebhooks(client, url, { previousUrl: store.webhookUrl });
      await store.setWebhookUrl(url);
      webhooks.registered = result.full.length < WEBHOOK_IDS.length;
      if (result.full.length > 0) {
        logger.warn(`Mailgun webhooks already full (3 URLs): ${result.full.join(', ')}`);
      }
      return result;
    } catch (err) {
      webhooks.registered = false;
      webhooks.error = err;
      logger.warn(`Mailgun webhooks not registered: ${err.message}`);
      throw err;
    }
  }

  async function handleWebhook({ body }) {
    const payload = parseWebhookBody(body);
    if (!payload) {
      logger.debug('Webhook call without a Mailgun JSON body: ignored');
      return;
    }
    if (config.webhook_signing_key) {
      const verdict = verifier.verify(config.webhook_signing_key, payload.signature);
      if (verdict !== 'ok') {
        logger.warn(`Mailgun webhook refused: signature ${verdict}`);
        return;
      }
    } else if (!unsignedWarned) {
      unsignedWarned = true;
      logger.warn(
        'Mailgun webhook signatures are not checked: fill in the webhook signing key in the configuration.',
      );
    }
    const event = toEmailEvent(payload);
    if (!event) {
      logger.debug(`Mailgun event "${payload?.['event-data']?.event}" ignored`);
      return;
    }
    if (event.id && store.events.some((entry) => entry.id === event.id)) {
      // Mailgun retries a call it did not see acknowledged: one event, one scene run.
      logger.debug(`Mailgun event ${event.id} already received`);
      return;
    }
    logger.info(`Mailgun event ${event.event} for ${maskEmail(event.recipient)}`);
    await store.addEvent({
      id: event.id,
      event: event.event,
      at: event.at,
      recipient: event.recipient,
      subject: event.subject,
      reason: event.reason,
      url: event.url,
    });
    await gladys.publishSceneEvent(event.trigger, sceneEventData(event));
    nudge(WIDGETS.EVENTS);
  }

  // --- Widgets ---------------------------------------------------------------

  async function activityContent(settings) {
    let content = null;
    let statsError = null;
    if (client) {
      try {
        content = await stats.read(client, settings?.period);
      } catch (err) {
        statsError = err;
        logger.warn(`Mailgun statistics unavailable: ${err.message}`);
      }
    }
    return buildActivityWidget({
      config,
      settings,
      stats: content,
      statsError,
      domain,
      webhooks,
      counts: limiter.counts(),
    });
  }

  /** "Re-pull this widget now": fire-and-forget, dropped while disconnected. */
  function nudge(key) {
    try {
      Promise.resolve(gladys.requestWidgetRefresh(key)).catch(() => {});
    } catch {
      // Never let a dashboard nudge fail a send or an action.
    }
  }

  function refreshWidgets() {
    for (const key of Object.values(WIDGETS)) {
      nudge(key);
    }
  }

  // --- Registration ----------------------------------------------------------

  // Notification channel: Gladys hands the message and the target user's
  // `contact_schema` values. Throwing reports the failure to Gladys.
  gladys.onSendMessage(async (contact, message) => {
    const to = parseRecipients(contact?.email, { required: true, field: 'email' });
    await sendEmail({
      to,
      subject: config.notification_subject,
      text: message?.text ?? '',
      image: message?.file ?? null,
    });
  });

  gladys.onAction(ACTIONS.TEST_CONNECTION, async () => {
    const result = await refreshConnection();
    refreshWidgets();
    return result.message;
  });

  gladys.onAction(ACTIONS.SEND_TEST_EMAIL, async (fields) => {
    try {
      const to = parseRecipients(fields?.to, { required: true, field: 'to' });
      const result = await sendEmail({ to, ...testEmail() });
      refreshWidgets();
      return t({
        en: `Test email sent to ${to.join(', ')} (id ${result.id}).`,
        fr: `E-mail de test envoyé à ${to.join(', ')} (id ${result.id}).`,
        de: `Test-E-Mail an ${to.join(', ')} gesendet (ID ${result.id}).`,
        es: `Correo de prueba enviado a ${to.join(', ')} (id ${result.id}).`,
      });
    } catch (err) {
      return describeError(err);
    }
  });

  gladys.onAction(ACTIONS.REGISTER_WEBHOOKS, async () => {
    if (!client) {
      return checkMessageNotConfigured();
    }
    let result;
    try {
      result = await syncWebhooks(undefined, { force: true, cleanup: true });
    } catch (err) {
      return describeError(err);
    } finally {
      refreshWidgets();
    }
    if (!result) {
      return t({
        en: 'Gladys Plus is not linked: Mailgun events cannot reach Gladys. Paste your Gladys Plus Open API key in the "Gladys Plus webhooks" block, then try again.',
        fr: "Gladys Plus n'est pas relié : les événements Mailgun ne peuvent pas atteindre Gladys. Collez votre clé Open API Gladys Plus dans le bloc « Webhooks Gladys Plus », puis réessayez.",
        de: 'Gladys Plus ist nicht verbunden: Mailgun-Ereignisse können Gladys nicht erreichen. Füge deinen Gladys-Plus-Open-API-Schlüssel im Block „Gladys-Plus-Webhooks“ ein und versuche es erneut.',
        es: 'Gladys Plus no está vinculado: los eventos de Mailgun no pueden llegar a Gladys. Pegue su clave Open API de Gladys Plus en el bloque «Webhooks de Gladys Plus» y vuelva a intentarlo.',
      });
    }
    const full = result.full.length;
    return t({
      en: `Mailgun webhooks registered (${result.added.length} added, ${result.unchanged.length} already there${full ? `, ${full} full with 3 URLs` : ''}).`,
      fr: `Webhooks Mailgun inscrits (${result.added.length} ajoutés, ${result.unchanged.length} déjà présents${full ? `, ${full} pleins avec 3 URL` : ''}).`,
      de: `Mailgun-Webhooks registriert (${result.added.length} hinzugefügt, ${result.unchanged.length} schon vorhanden${full ? `, ${full} voll mit 3 URLs` : ''}).`,
      es: `Webhooks de Mailgun registrados (${result.added.length} añadidos, ${result.unchanged.length} ya presentes${full ? `, ${full} llenos con 3 URL` : ''}).`,
    });
  });

  gladys.onSceneAction(SCENE_ACTIONS.SEND_EMAIL, (fields) =>
    sendEmailAction(fields, { sendEmail }).then((outputs) => {
      refreshWidgets();
      return outputs;
    }),
  );

  gladys.onWidgetGet(WIDGETS.ACTIVITY, ({ settings }) => activityContent(settings));
  gladys.onWidgetGet(WIDGETS.EVENTS, async ({ settings }) =>
    buildEventsWidget({ config, events: store.events, settings, webhooks }),
  );
  gladys.onWidgetAction(WIDGETS.ACTIVITY, async (actionKey, _params, { values } = {}) => {
    if (actionKey === WIDGET_ACTIONS.REFRESH) {
      stats.clear();
      await refreshConnection();
      return t({ en: 'Refreshed', fr: 'Actualisé', de: 'Aktualisiert', es: 'Actualizado' });
    }
    if (actionKey === WIDGET_ACTIONS.SEND_TEST) {
      try {
        const to = parseRecipients(values?.to, { required: true, field: 'to' });
        await sendEmail({ to, ...testEmail() });
        return t({
          en: 'Test email sent',
          fr: 'E-mail de test envoyé',
          de: 'Test-E-Mail gesendet',
          es: 'Correo de prueba enviado',
        });
      } catch (err) {
        return shortToast(describeError(err));
      }
    }
    throw new Error(`Unknown widget action ${actionKey}`);
  });

  gladys.onWebhook(WEBHOOK_KEY, handleWebhook);

  gladys.onWebhookUpdated(async (info) => {
    await syncWebhooks(info, { cleanup: true }).catch(() => {});
    refreshWidgets();
  });

  gladys.onConfigUpdated(async (newConfig) => {
    logger.info('Configuration updated');
    applyConfig(newConfig);
    await refreshConnection();
    await syncWebhooks().catch(() => {});
    refreshWidgets();
  });

  gladys.on('connected', async () => {
    try {
      await loadState();
      applyConfig(await gladys.getConfig());
      await refreshConnection();
      await syncWebhooks().catch(() => {});
      refreshWidgets();
    } catch (err) {
      logger.error('Post-connection initialization failed', err);
      await gladys
        .setConnectionStatus(
          false,
          t({
            en: 'Initialization failed, check the integration logs.',
            fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
            de: 'Die Initialisierung ist fehlgeschlagen, sieh dir die Logs der Integration an.',
            es: 'La inicialización falló, consulte los registros de la integración.',
          }),
        )
        .catch(() => {});
    }
    stopChecks();
    timer = startTimer(() => {
      refreshConnection().catch((err) => logger.warn(`Periodic check failed: ${err.message}`));
    }, CHECK_INTERVAL_MS);
    timer?.unref?.();
  });

  gladys.on('disconnected', stopChecks);

  function stopChecks() {
    if (timer) {
      stopTimer(timer);
      timer = null;
    }
  }

  return {
    /** Stop the timers (graceful shutdown). */
    stop: stopChecks,
    /** For the tests. */
    get config() {
      return config;
    },
    sendEmail,
  };
}

function testEmail() {
  return {
    subject: 'Gladys + Mailgun',
    text:
      'This is a test email sent by the Mailgun integration of Gladys Assistant. It works!\n\n' +
      "Ceci est un e-mail de test envoyé par l'intégration Mailgun de Gladys Assistant. Ça marche !",
    tags: ['gladys-test'],
  };
}

/** A widget toast holds 200 characters. */
function shortToast(texts) {
  return Object.fromEntries(
    Object.entries(texts).map(([language, text]) => [
      language,
      text.length > 200 ? `${text.slice(0, 199)}…` : text,
    ]),
  );
}
