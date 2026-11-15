// -----------------------------------------------------------------------------
// Dashboard widgets (manifest `widgets`, Gladys 5.1+).
//
// - `activity`: the sending figures of the domain over a period (Mailgun
//   statistics), the state of the domain and of the webhooks, how many emails
//   Gladys itself sent against the cap, and two buttons: send a test email
//   (a form behind the tap) and refresh.
// - `events`: the last events Mailgun pushed through the webhooks (delivered,
//   failed, opened…), newest first.
//
// The content is declarative (the core renders it, no HTML): see the
// "Dashboard widgets" section of the SDK README for the vocabulary and the
// budget — at most 8 components, 1 focal, 6 tiles, 2 texts, 1 status list and
// 4 buttons. Every text is a `{ en, fr, de, es }` object.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { localize, pick } from '../i18n.js';
import { describeError } from '../mailgun/errors.js';
import { NOT_CONFIGURED } from '../mailgun/connection.js';
import { DEFAULT_PERIOD, PERIODS } from '../mailgun/stats.js';

/** Keys of the manifest `widgets`. Never renamed: dashboards store them. */
export const WIDGETS = {
  ACTIVITY: 'activity',
  EVENTS: 'events',
};

/** Keys of the widget button actions, relayed back to onWidgetAction. */
export const WIDGET_ACTIONS = {
  SEND_TEST: 'send_test',
  REFRESH: 'refresh',
};

/** Events listed when the instance says nothing, and at most (list display). */
export const DEFAULT_EVENT_COUNT = 5;
const MAX_EVENT_COUNT = 8;

const MAILGUN_APP_URL = 'https://app.mailgun.com/';

const t = (texts) => localize((language) => pick(language, texts));

const LABELS = {
  accepted: t({ en: 'Sent', fr: 'Envoyés', de: 'Gesendet', es: 'Enviados' }),
  delivered: t({ en: 'Delivered', fr: 'Délivrés', de: 'Zugestellt', es: 'Entregados' }),
  failed: t({ en: 'Failed', fr: 'Échecs', de: 'Fehlgeschlagen', es: 'Fallidos' }),
  opened: t({ en: 'Opened', fr: 'Ouverts', de: 'Geöffnet', es: 'Abiertos' }),
};

const EVENT_BADGES = {
  delivered: { text: LABELS.delivered, color: WIDGET_COLORS.SUCCESS },
  failed: { text: LABELS.failed, color: WIDGET_COLORS.DANGER },
  opened: { text: LABELS.opened, color: WIDGET_COLORS.INFO },
  clicked: {
    text: t({ en: 'Clicked', fr: 'Cliqué', de: 'Geklickt', es: 'Clic' }),
    color: WIDGET_COLORS.INFO,
  },
  complained: {
    text: t({ en: 'Spam report', fr: 'Signalé spam', de: 'Spam-Meldung', es: 'Marcado spam' }),
    color: WIDGET_COLORS.WARNING,
  },
  unsubscribed: {
    text: t({ en: 'Unsubscribed', fr: 'Désabonné', de: 'Abgemeldet', es: 'Baja' }),
    color: WIDGET_COLORS.WARNING,
  },
};

/** Events that call for attention, for the "problems only" filter. */
const PROBLEMS = new Set(['failed', 'complained', 'unsubscribed']);

function periodOf(settings) {
  return settings?.period in PERIODS ? settings.period : DEFAULT_PERIOD;
}

function shorten(value, max) {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** The "Webhooks" status row. */
function webhookItem(webhooks, config) {
  const label = t({
    en: 'Mailgun events',
    fr: 'Événements Mailgun',
    de: 'Mailgun-Ereignisse',
    es: 'Eventos de Mailgun',
  });
  if (!webhooks?.available) {
    return {
      label,
      value: t({
        en: 'Gladys Plus not linked',
        fr: 'Gladys Plus non relié',
        de: 'Gladys Plus nicht verbunden',
        es: 'Gladys Plus no vinculado',
      }),
      color: WIDGET_COLORS.NEUTRAL,
    };
  }
  if (webhooks.error) {
    return {
      label,
      value: t({
        en: 'Registration failed',
        fr: "Échec de l'inscription",
        de: 'Registrierung fehlgeschlagen',
        es: 'Registro fallido',
      }),
      color: WIDGET_COLORS.DANGER,
    };
  }
  if (!webhooks.registered) {
    return {
      label,
      value: t({
        en: 'Not registered',
        fr: 'Non inscrits',
        de: 'Nicht registriert',
        es: 'No registrados',
      }),
      color: WIDGET_COLORS.WARNING,
    };
  }
  return {
    label,
    value: config.webhook_signing_key
      ? t({
          en: 'Received, signed',
          fr: 'Reçus, signés',
          de: 'Empfangen, signiert',
          es: 'Recibidos, firmados',
        })
      : t({
          en: 'Received, not verified',
          fr: 'Reçus, non vérifiés',
          de: 'Empfangen, ungeprüft',
          es: 'Recibidos, sin verificar',
        }),
    color: config.webhook_signing_key ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.WARNING,
  };
}

/** The "Domain" status row. */
function domainItem(domain, config) {
  const label = t({ en: `Domain`, fr: 'Domaine', de: 'Domain', es: 'Dominio' });
  if (!domain || domain.state === null) {
    return {
      label,
      value: t({ en: 'Unreachable', fr: 'Injoignable', de: 'Nicht erreichbar', es: 'Inaccesible' }),
      color: WIDGET_COLORS.DANGER,
    };
  }
  const active = domain.state === 'active';
  return {
    label,
    value: shorten(`${config.domain} (${domain.state})`, 40),
    color: active ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.WARNING,
  };
}

/** The "Sent by Gladys" status row: the sending cap at a glance. */
function capItem(counts, config) {
  const ratio = counts.lastHour / config.max_emails_per_hour;
  return {
    label: t({
      en: 'Sent by Gladys (last hour)',
      fr: 'Envoyés par Gladys (1 h)',
      de: 'Von Gladys gesendet (1 Std.)',
      es: 'Enviados por Gladys (1 h)',
    }),
    value: `${counts.lastHour} / ${config.max_emails_per_hour}`,
    color:
      ratio >= 1
        ? WIDGET_COLORS.DANGER
        : ratio >= 0.8
          ? WIDGET_COLORS.WARNING
          : WIDGET_COLORS.NEUTRAL,
  };
}

/**
 * Content of the `activity` widget.
 *
 * @param {object} state
 * @param {object} state.config normalized configuration
 * @param {object} [state.settings] instance settings (`period`)
 * @param {{ totals: object, points: object[] } | null} [state.stats]
 * @param {unknown} [state.statsError]
 * @param {{ state: string|null } | null} [state.domain] last connection check
 * @param {{ available: boolean, registered: boolean, error?: unknown } | null} [state.webhooks]
 * @param {{ lastHour: number, lastDay: number }} [state.counts]
 */
export function buildActivityWidget({
  config,
  settings = {},
  stats = null,
  statsError = null,
  domain = null,
  webhooks = null,
  counts = { lastHour: 0, lastDay: 0 },
}) {
  if (!config.configured) {
    return {
      ttl_seconds: 300,
      components: [
        { type: 'text', variant: 'body', text: NOT_CONFIGURED },
        {
          type: 'button',
          label: t({
            en: 'Open Mailgun',
            fr: 'Ouvrir Mailgun',
            de: 'Mailgun öffnen',
            es: 'Abrir Mailgun',
          }),
          icon: 'external-link',
          link: { url: MAILGUN_APP_URL },
        },
      ],
    };
  }

  const components = [];
  if (statsError) {
    components.push({ type: 'text', variant: 'body', text: describeError(statsError) });
  }
  if (stats) {
    const { totals } = stats;
    components.push(
      {
        type: 'value',
        label: LABELS.accepted,
        value: totals.accepted,
        icon: 'send',
        color: WIDGET_COLORS.PRIMARY,
      },
      {
        type: 'value',
        label: LABELS.delivered,
        value: totals.delivered,
        icon: 'check-circle',
        color: WIDGET_COLORS.SUCCESS,
      },
      {
        type: 'value',
        label: LABELS.failed,
        value: totals.failed,
        icon: 'alert-triangle',
        color: totals.failed > 0 ? WIDGET_COLORS.DANGER : WIDGET_COLORS.NEUTRAL,
      },
      {
        type: 'value',
        label: LABELS.opened,
        value: totals.opened,
        icon: 'eye',
        color: WIDGET_COLORS.INFO,
      },
    );
    if (stats.points.length >= 2) {
      components.push({
        type: 'chart',
        chart_type: periodOf(settings) === '1d' ? 'bar' : 'line',
        title: t({
          en: 'Delivered and failed',
          fr: 'Délivrés et échecs',
          de: 'Zugestellt und Fehler',
          es: 'Entregados y fallidos',
        }),
        series: [
          {
            name: LABELS.delivered,
            points: stats.points.map((point) => ({ t: point.t, v: point.delivered })),
          },
          {
            name: LABELS.failed,
            points: stats.points.map((point) => ({ t: point.t, v: point.failed })),
          },
        ],
      });
    }
  }
  components.push({
    type: 'status',
    items: [domainItem(domain, config), webhookItem(webhooks, config), capItem(counts, config)],
  });
  components.push(
    {
      type: 'button',
      label: t({
        en: 'Send a test email',
        fr: 'E-mail de test',
        de: 'Test-E-Mail senden',
        es: 'Correo de prueba',
      }),
      icon: 'mail',
      style: 'primary',
      action: {
        key: WIDGET_ACTIONS.SEND_TEST,
        fields: [
          {
            key: 'to',
            type: 'string',
            required: true,
            label: t({ en: 'Recipient', fr: 'Destinataire', de: 'Empfänger', es: 'Destinatario' }),
            placeholder: t({
              en: 'you@example.com',
              fr: 'vous@exemple.fr',
              de: 'du@beispiel.de',
              es: 'usted@ejemplo.es',
            }),
          },
        ],
      },
    },
    {
      type: 'button',
      label: t({ en: 'Refresh', fr: 'Actualiser', de: 'Aktualisieren', es: 'Actualizar' }),
      icon: 'refresh-cw',
      action: { key: WIDGET_ACTIONS.REFRESH },
    },
  );
  return { ttl_seconds: 300, components };
}

/**
 * Content of the `events` widget.
 *
 * @param {object} state
 * @param {object} state.config normalized configuration
 * @param {object[]} state.events stored events, newest first
 * @param {object} [state.settings] instance settings (`count`, `filter`)
 * @param {{ available: boolean, registered: boolean } | null} [state.webhooks]
 */
export function buildEventsWidget({ config, events, settings = {}, webhooks = null }) {
  const count = Math.min(
    MAX_EVENT_COUNT,
    Math.max(1, Math.round(Number(settings.count) || DEFAULT_EVENT_COUNT)),
  );
  const problemsOnly = settings.filter === 'problems';
  const shown = events
    .filter((event) => !problemsOnly || PROBLEMS.has(event.event))
    .slice(0, count);

  if (shown.length === 0) {
    let text;
    if (!config.configured) {
      text = NOT_CONFIGURED;
    } else if (!webhooks?.available) {
      text = t({
        en: 'Mailgun events (delivered, failed, opened…) arrive through Gladys Plus: link Gladys Plus and paste its Open API key in the integration configuration.',
        fr: "Les événements Mailgun (délivré, échec, ouvert…) arrivent via Gladys Plus : reliez Gladys Plus et collez sa clé Open API dans la configuration de l'intégration.",
        de: 'Mailgun-Ereignisse (zugestellt, fehlgeschlagen, geöffnet…) kommen über Gladys Plus: Verbinde Gladys Plus und füge seinen Open-API-Schlüssel in der Konfiguration der Integration ein.',
        es: 'Los eventos de Mailgun (entregado, fallido, abierto…) llegan a través de Gladys Plus: vincule Gladys Plus y pegue su clave Open API en la configuración de la integración.',
      });
    } else {
      text = t({
        en: 'No Mailgun event received yet.',
        fr: 'Aucun événement Mailgun reçu pour le moment.',
        de: 'Noch kein Mailgun-Ereignis empfangen.',
        es: 'Todavía no se ha recibido ningún evento de Mailgun.',
      });
    }
    return { ttl_seconds: 120, components: [{ type: 'text', variant: 'body', text }] };
  }

  return {
    ttl_seconds: 120,
    components: [
      {
        type: 'card-list',
        display: 'list',
        items: shown.map((event) => {
          const item = {
            title: shorten(event.subject || event.recipient || event.event, 60),
            badge: EVENT_BADGES[event.event] ?? { text: shorten(event.event, 16) },
          };
          if (event.recipient && event.subject) {
            item.subtitle = shorten(event.recipient, 60);
          }
          if (event.at) {
            item.date = event.at;
          }
          const description = [event.reason, event.url].filter(Boolean).join('\n');
          if (description) {
            item.description = shorten(description, 2000);
          }
          if (event.url && /^https:\/\//.test(event.url)) {
            item.links = [
              {
                url: event.url,
                label: t({
                  en: 'Open the link',
                  fr: 'Ouvrir le lien',
                  de: 'Link öffnen',
                  es: 'Abrir el enlace',
                }),
              },
            ];
          }
          return item;
        }),
      },
    ],
  };
}
