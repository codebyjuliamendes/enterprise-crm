'use strict';

/**
 * Irreversible anonymization of a contact's personal data (LGPD art. 5, XI / art. 16).
 * Hashing an e-mail or phone is only pseudonymization (it can be reversed with a
 * dictionary), so personal fields are replaced or cleared instead.
 *
 * @param {{ id: number }} contact
 * @returns {{ name: string, email: null, phone: null, tags: null }}
 */
function anonymizedContactFields(contact) {
  return { name: `Anonymized contact #${contact.id}`, email: null, phone: null, tags: null };
}

module.exports = { anonymizedContactFields };
