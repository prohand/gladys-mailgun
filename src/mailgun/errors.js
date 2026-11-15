// -----------------------------------------------------------------------------
// Errors of the Mailgun API, and the sentence a user can act on for each.
// -----------------------------------------------------------------------------

import { localize, pick } from '../i18n.js';

/** An answer of the Mailgun API that is not a success. */
export class MailgunError extends Error {
  /**
   * @param {number} status HTTP status (0 when the network failed)
   * @param {string} message the message Mailgun returned, or the network error
   */
  constructor(status, message) {
    super(message);
    this.name = 'MailgunError';
    this.status = status;
  }
}

/** The sending cap of the configuration is reached: nothing was sent. */
export class SendLimitError extends Error {
  constructor(limit) {
    super(`Sending cap reached (${limit} emails per hour)`);
    this.name = 'SendLimitError';
    this.limit = limit;
  }
}

/** A value typed by a user or a scene that Mailgun would refuse anyway. */
export class InvalidInputError extends Error {
  constructor(message, texts) {
    super(message);
    this.name = 'InvalidInputError';
    this.texts = texts;
  }
}

/**
 * What went wrong, in the user's words and language.
 *
 * @param {unknown} err
 * @returns {Record<string, string>} `{ en, fr, de, es }`
 */
export function describeError(err) {
  if (err instanceof SendLimitError) {
    return localize((language) =>
      pick(language, {
        en: `Sending cap reached: ${err.limit} emails in the last hour. Raise it in the configuration if this is expected.`,
        fr: `Limite d'envoi atteinte : ${err.limit} e-mails dans la dernière heure. Augmentez-la dans la configuration si c'est normal.`,
        de: `Versandlimit erreicht: ${err.limit} E-Mails in der letzten Stunde. Erhöhe es in der Konfiguration, wenn das so gewollt ist.`,
        es: `Límite de envío alcanzado: ${err.limit} correos en la última hora. Auméntelo en la configuración si es lo esperado.`,
      }),
    );
  }
  if (err instanceof InvalidInputError) {
    return err.texts;
  }
  if (!(err instanceof MailgunError)) {
    return localize((language) =>
      pick(language, {
        en: `Unexpected error: ${err?.message ?? err}`,
        fr: `Erreur inattendue : ${err?.message ?? err}`,
        de: `Unerwarteter Fehler: ${err?.message ?? err}`,
        es: `Error inesperado: ${err?.message ?? err}`,
      }),
    );
  }
  const detail = err.message ? ` (${err.message})` : '';
  switch (err.status) {
    case 0:
      return localize((language) =>
        pick(language, {
          en: `Mailgun cannot be reached: check the Internet access of Gladys${detail}.`,
          fr: `Mailgun est injoignable : vérifiez l'accès Internet de Gladys${detail}.`,
          de: `Mailgun ist nicht erreichbar: Prüfe den Internetzugang von Gladys${detail}.`,
          es: `No se puede contactar con Mailgun: compruebe el acceso a Internet de Gladys${detail}.`,
        }),
      );
    case 401:
    case 403:
      return localize((language) =>
        pick(language, {
          en: `Mailgun refused the API key: check the key, and that it may send for this domain${detail}.`,
          fr: `Mailgun a refusé la clé d'API : vérifiez la clé, et qu'elle a le droit d'envoyer pour ce domaine${detail}.`,
          de: `Mailgun hat den API-Schlüssel abgelehnt: Prüfe den Schlüssel und ob er für diese Domain senden darf${detail}.`,
          es: `Mailgun rechazó la clave de API: compruebe la clave y que puede enviar para este dominio${detail}.`,
        }),
      );
    case 404:
      return localize((language) =>
        pick(language, {
          en: `Mailgun does not know this domain: check its spelling and the region (US or EU) of your account${detail}.`,
          fr: `Mailgun ne connaît pas ce domaine : vérifiez son orthographe et la région (US ou UE) de votre compte${detail}.`,
          de: `Mailgun kennt diese Domain nicht: Prüfe die Schreibweise und die Region (US oder EU) deines Kontos${detail}.`,
          es: `Mailgun no conoce este dominio: compruebe cómo está escrito y la región (EE. UU. o UE) de su cuenta${detail}.`,
        }),
      );
    case 429:
      return localize((language) =>
        pick(language, {
          en: `Mailgun is limiting the requests of this account, try again later${detail}.`,
          fr: `Mailgun limite les requêtes de ce compte, réessayez plus tard${detail}.`,
          de: `Mailgun begrenzt die Anfragen dieses Kontos, versuche es später erneut${detail}.`,
          es: `Mailgun está limitando las peticiones de esta cuenta, inténtelo más tarde${detail}.`,
        }),
      );
    default:
      return localize((language) =>
        pick(language, {
          en: `Mailgun answered with an error ${err.status}${detail}.`,
          fr: `Mailgun a répondu par une erreur ${err.status}${detail}.`,
          de: `Mailgun hat mit dem Fehler ${err.status} geantwortet${detail}.`,
          es: `Mailgun respondió con un error ${err.status}${detail}.`,
        }),
      );
  }
}
