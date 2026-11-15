// -----------------------------------------------------------------------------
// Is the configuration usable? The answer of the "Test the connection" button,
// of the connection status shown in the Configuration screen, and of the
// widget status rows.
// -----------------------------------------------------------------------------

import { localize, pick } from '../i18n.js';
import { describeError } from './errors.js';

/** Message shown while the API key or the domain is still empty. */
export const NOT_CONFIGURED = localize((language) =>
  pick(language, {
    en: 'Fill in the Mailgun API key and the sending domain.',
    fr: "Renseignez la clé d'API Mailgun et le domaine d'envoi.",
    de: 'Gib den Mailgun-API-Schlüssel und die Versanddomain ein.',
    es: 'Indique la clave de API de Mailgun y el dominio de envío.',
  }),
);

/** State of a domain that a sending key cannot read, but sends through. */
export const SENDING_ONLY = 'sending-only';

const SENDING_ONLY_MESSAGE = localize((language) =>
  pick(language, {
    en: 'Connected with a sending key: emails go out. The widget statistics and the automatic webhooks need the private API key.',
    fr: "Connecté avec une clé d'envoi : les e-mails partent. Les statistiques du widget et les webhooks automatiques demandent la clé d'API privée.",
    de: 'Mit einem Sendeschlüssel verbunden: E-Mails gehen raus. Die Widget-Statistiken und die automatischen Webhooks brauchen den privaten API-Schlüssel.',
    es: 'Conectado con una clave de envío: los correos salen. Las estadísticas del widget y los webhooks automáticos necesitan la clave de API privada.',
  }),
);

function keyRefused() {
  return localize((language) =>
    pick(language, {
      en: 'Mailgun refused the API key for reading the domain. With a domain sending key this is expected: click "Send a test email" to check that sending works.',
      fr: "Mailgun a refusé la clé d'API pour lire le domaine. Avec une clé d'envoi du domaine, c'est normal : cliquez sur « Envoyer un e-mail de test » pour vérifier que l'envoi marche.",
      de: 'Mailgun hat den API-Schlüssel zum Lesen der Domain abgelehnt. Mit einem Sendeschlüssel der Domain ist das normal: Klicke auf „Test-E-Mail senden“, um zu prüfen, ob das Senden funktioniert.',
      es: 'Mailgun rechazó la clave de API para leer el dominio. Con una clave de envío del dominio es normal: pulse «Enviar un correo de prueba» para comprobar que el envío funciona.',
    }),
  );
}

/**
 * @param {ReturnType<import('./client.js').createMailgunClient> | null} client
 * @param {object} [options]
 * @param {boolean} [options.sendingWorks] an email went through with this key
 * @returns {Promise<{ ok: boolean, state: string|null, message: Record<string,string> }>}
 */
export async function checkConnection(client, { sendingWorks = false } = {}) {
  if (!client) {
    return { ok: false, state: null, message: NOT_CONFIGURED };
  }
  let domain;
  try {
    domain = await client.getDomain();
  } catch (err) {
    if ([401, 403].includes(err.status)) {
      // A domain sending key may send, but not read the domain: refused here
      // proves nothing. Once an email went through, the key is good.
      if (sendingWorks) {
        return { ok: true, state: SENDING_ONLY, message: SENDING_ONLY_MESSAGE };
      }
      return { ok: false, state: null, message: keyRefused(), error: err };
    }
    return { ok: false, state: null, message: describeError(err), error: err };
  }
  const state = String(domain.state ?? 'unknown');
  const name = domain.name ?? client.domain;
  const region = client.region.toUpperCase();
  if (state === 'active') {
    return {
      ok: true,
      state,
      message: localize((language) =>
        pick(language, {
          en: `Connected: domain ${name} is active (region ${region}).`,
          fr: `Connecté : le domaine ${name} est actif (région ${region}).`,
          de: `Verbunden: Die Domain ${name} ist aktiv (Region ${region}).`,
          es: `Conectado: el dominio ${name} está activo (región ${region}).`,
        }),
      ),
    };
  }
  // A sandbox or a domain whose DNS records are not verified yet still sends,
  // but only to the "authorized recipients" of the account: worth saying.
  return {
    ok: true,
    state,
    message: localize((language) =>
      pick(language, {
        en: `Connected, but domain ${name} is "${state}": until its DNS records are verified, Mailgun only sends to the authorized recipients of the account.`,
        fr: `Connecté, mais le domaine ${name} est « ${state} » : tant que ses enregistrements DNS ne sont pas vérifiés, Mailgun n'envoie qu'aux destinataires autorisés du compte.`,
        de: `Verbunden, aber die Domain ${name} ist „${state}“: Solange ihre DNS-Einträge nicht verifiziert sind, sendet Mailgun nur an die autorisierten Empfänger des Kontos.`,
        es: `Conectado, pero el dominio ${name} está «${state}»: mientras sus registros DNS no estén verificados, Mailgun solo envía a los destinatarios autorizados de la cuenta.`,
      }),
    ),
  };
}
