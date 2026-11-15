# Intégration Mailgun pour Gladys Assistant

Recevez vos notifications Gladys par e-mail via [Mailgun](https://www.mailgun.com/), envoyez des
e-mails depuis vos scènes, et lancez des scènes quand un e-mail est délivré, échoue, est ouvert ou
cliqué.

Mailgun est un service **cloud** : Gladys a besoin d'un accès Internet pour envoyer les e-mails.

## Ce qu'il vous faut

- Un compte Mailgun (l'offre gratuite suffit pour commencer).
- Un **domaine d'envoi** dans Mailgun, par exemple `mg.exemple.fr`. Le domaine « sandbox » que
  Mailgun crée pour vous marche aussi, mais il n'envoie qu'aux « destinataires autorisés » de
  votre compte.
- Une **clé d'API** :
  - une **clé d'envoi du domaine** (Mailgun → _Sending_ → _Domain settings_ → _Sending keys_)
    suffit pour envoyer des e-mails ;
  - la **clé d'API privée** (Mailgun → _API keys_) est nécessaire pour les statistiques du widget
    et pour inscrire les webhooks automatiquement.
- La **région** de votre compte : US (`api.mailgun.net`) ou UE (`api.eu.mailgun.net`). Un domaine
  créé dans la région UE n'existe pas pour l'API US.
- Facultatif : **Gladys Plus**, pour recevoir les événements Mailgun (délivré, échec, ouvert…) et
  lancer des scènes avec.

## Configuration

Dans Gladys : **Intégrations** → **Mailgun** → **Configuration**.

| Champ                                              | À renseigner                                                                               |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Clé d'API Mailgun                                  | La clé d'envoi ou la clé d'API privée.                                                     |
| Domaine d'envoi                                    | Le domaine tel que listé dans Mailgun, par exemple `mg.exemple.fr`.                        |
| Région du compte                                   | États-Unis ou Europe.                                                                      |
| Nom de l'expéditeur                                | Le nom affiché dans la boîte de réception. Par défaut : `Gladys`.                          |
| Adresse de l'expéditeur                            | Une adresse du domaine d'envoi. Vide : `gladys@<votre domaine>`.                           |
| Objet des notifications                            | Objet des e-mails de notification. Par défaut : `Gladys`.                                  |
| Envoyer aussi une version HTML                     | Liens cliquables et image de caméra dans l'e-mail. Activé par défaut.                      |
| Limite d'envoi (e-mails par heure)                 | Au-delà, les e-mails sont refusés jusqu'à ce que l'heure soit passée. Défaut : 60.         |
| Inscrire les webhooks dans Mailgun automatiquement | Voir [Événements Mailgun](#événements-mailgun-déclencheurs-de-scène). Activé par défaut.   |
| Clé de signature des webhooks                      | Depuis la page _Webhooks_ de Mailgun. Fortement conseillé si vous utilisez les événements. |

Cliquez sur **Tester la connexion** : la réponse dit si le domaine est connu et actif. Puis
**Envoyer un e-mail de test** à votre propre adresse.

### Mon compte (chaque utilisateur)

Chaque utilisateur Gladys saisit **sa propre adresse e-mail** dans le bloc **Mon compte** du même
écran. Gladys envoie les notifications de cet utilisateur à cette adresse. Un utilisateur sans
adresse ne reçoit pas d'e-mail.

## Notifications

Une fois votre adresse renseignée, chaque notification que Gladys vous envoie (alarme, scènes
« Envoyer un message », image de caméra…) arrive aussi par e-mail. L'image de caméra est affichée
dans l'e-mail quand la version HTML est activée.

## Action de scène : « Envoyer un e-mail »

Dans une scène, ajoutez l'action **Intégrations** → **Mailgun** → **Envoyer un e-mail** :

| Champ                | Description                                                                           |
| -------------------- | ------------------------------------------------------------------------------------- |
| Destinataires        | Une ou plusieurs adresses, séparées par des virgules (20 au maximum).                 |
| Objet                | Objet de l'e-mail.                                                                    |
| Message              | Texte de l'e-mail.                                                                    |
| Copie / Copie cachée | Copies facultatives.                                                                  |
| Répondre à           | Adresse de réponse facultative.                                                       |
| Étiquettes Mailgun   | Jusqu'à 3, séparées par des virgules. Utile pour filtrer les déclencheurs ci-dessous. |

Les variables de scène (`{{...}}`) marchent dans tous les champs. L'action renvoie :

- `sent` : `true` quand Mailgun a accepté l'e-mail ;
- `message_id` : l'identifiant Mailgun de l'e-mail ;
- `error` : pourquoi l'e-mail n'est pas parti (vide sinon).

L'action n'arrête jamais la scène : testez `sent` dans une condition si la suite en dépend.

## Événements Mailgun (déclencheurs de scène)

Mailgun peut dire à Gladys ce que deviennent les e-mails. Mailgun doit joindre votre Gladys depuis
Internet : cela passe par **Gladys Plus**.

1. Dans l'écran de configuration Mailgun, collez votre **clé Open API Gladys Plus** dans le bloc
   **Webhooks Gladys Plus**.
2. Laissez **Inscrire les webhooks dans Mailgun automatiquement** activé (demande la clé d'API
   privée), ou cliquez sur **Inscrire les webhooks Mailgun**. L'intégration ajoute son URL à côté
   de celles que vous avez déjà ; Mailgun accepte 3 URL par événement.
3. Dans Mailgun, ouvrez **Sending** → **Webhooks**, copiez la **HTTP webhook signing key** et
   collez-la dans **Clé de signature des webhooks**. Avec elle, seuls les événements vraiment signés
   par Mailgun lancent vos scènes.

Les déclencheurs, dans **Intégrations** → **Mailgun** :

| Déclencheur                  | Clé                  | Quand                                                     |
| ---------------------------- | -------------------- | --------------------------------------------------------- |
| Un e-mail est délivré        | `email_delivered`    | Le serveur du destinataire a accepté l'e-mail.            |
| Un e-mail échoue             | `email_failed`       | Mailgun n'a pas pu le délivrer (permanent ou temporaire). |
| Un e-mail est ouvert         | `email_opened`       | Le destinataire l'a ouvert (suivi des ouvertures activé). |
| Un lien est cliqué           | `email_clicked`      | Un lien a été cliqué (suivi des clics activé).            |
| Un e-mail est signalé spam   | `email_complained`   | Le destinataire l'a marqué comme spam.                    |
| Un destinataire se désabonne | `email_unsubscribed` | Le destinataire a utilisé le lien de désabonnement.       |

Chaque déclencheur peut être filtré sur le **destinataire** et l'**étiquette** (vide = tous).
« Un e-mail échoue » peut aussi être filtré sur le **type d'échec** (permanent, temporaire).

Variables disponibles dans les actions suivantes : `{{triggerEvent.data.recipient}}`,
`{{triggerEvent.data.subject}}`, `{{triggerEvent.data.tag}}`, `{{triggerEvent.data.message_id}}`,
plus `severity` et `reason` pour un échec et `url` pour un clic.

> Évitez une scène « quand un e-mail échoue, envoyer un e-mail à la même adresse » : elle peut
> boucler. La limite d'envoi l'arrête, mais votre quota Mailgun en pâtit quand même.

## Widgets du tableau de bord

- **Activité Mailgun** : e-mails envoyés, délivrés, en échec et ouverts sur 24 heures, 7 ou
  30 jours, un graphique, l'état du domaine, l'état des événements, le nombre d'e-mails envoyés par
  Gladys dans la dernière heure face à la limite, et les boutons **E-mail de test** et
  **Actualiser**. Les statistiques demandent la clé d'API privée.
- **Événements Mailgun** : les derniers événements reçus (demande Gladys Plus). Réglages : combien
  en afficher, et tous les événements ou les problèmes seulement (échecs, spam, désabonnements).

## En cas de problème

| Message                                        | Que faire                                                                       |
| ---------------------------------------------- | ------------------------------------------------------------------------------- |
| « Mailgun a refusé la clé d'API »              | Vérifiez la clé. Une clé d'envoi ne marche que pour son domaine.                |
| « Mailgun ne connaît pas ce domaine »          | Vérifiez l'orthographe, et la **région** (US/UE) du compte.                     |
| « le domaine … est unverified »                | Ajoutez les enregistrements DNS que Mailgun indique, puis vérifiez-le.          |
| « Limite d'envoi atteinte »                    | Une scène envoie trop. Corrigez-la, ou augmentez la limite.                     |
| Les événements n'arrivent jamais               | Vérifiez Gladys Plus, puis cliquez sur **Inscrire les webhooks Mailgun**.       |
| Événements refusés dans les logs (`signature`) | La clé de signature ne correspond pas à celle de la page _Webhooks_ de Mailgun. |

Les logs de l'intégration (Gladys → Intégrations → Mailgun → logs) donnent plus de détails. Ils
n'affichent jamais la clé d'API, et les adresses sont raccourcies (`a***@exemple.fr`).

## Vie privée

- La clé d'API et la clé de signature restent dans la configuration de Gladys.
- L'intégration garde, dans son propre dossier `/data`, les 20 derniers événements reçus
  (destinataire, objet, date) pour le widget, et l'heure des e-mails envoyés dans les dernières
  24 heures pour la limite d'envoi. Rien d'autre.
