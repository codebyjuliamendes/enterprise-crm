'use strict';

const { toCents, fromCents } = require('../domain/money');
const { ownerScope } = require('../domain/roles');
const { anonymizedContactFields } = require('../domain/anonymize');
const { badRequest, notFound } = require('../domain/errors');

/**
 * CRM use cases. Every write runs in a single transaction together with its audit
 * entry, so either both are stored or neither is.
 *
 * @param {{ db: import('../db/database').Database,
 *           repos: ReturnType<import('../repositories').createRepositories> }} deps
 */
function createCrmService({ db, repos }) {
  /** Contacts a user may reference: sales reps only their own. */
  const findVisibleContact = (user, contactId) => {
    const contact = repos.contacts.findById(contactId);
    const scope = ownerScope(user);
    if (!contact || (scope !== null && Number(contact.owner_id) !== scope)) return null;
    return contact;
  };

  return {
    stats(user) {
      const scope = ownerScope(user);
      const deals = repos.deals.stats(scope);
      return {
        contactsCount: repos.contacts.count(scope),
        dealsCount: deals.total,
        openDealsCount: deals.open,
        totalRevenue: fromCents(deals.wonCents),
        pipelineValue: fromCents(deals.openCents),
      };
    },

    listContacts(user, page) {
      return repos.contacts.list({ ownerId: ownerScope(user), ...page });
    },

    createContact(user, input) {
      if (input.company_id != null && !repos.companies.exists(input.company_id)) {
        throw badRequest('company_id does not reference an existing company');
      }
      return db.transaction(() => {
        const id = repos.contacts.create({
          name: input.name,
          email: input.email,
          phone: input.phone,
          companyId: input.company_id,
          tags: input.tags,
          ownerId: user.id,
        });
        const contact = repos.contacts.findById(id);
        repos.audit.record({
          userId: user.id,
          action: 'CREATE',
          entityType: 'CONTACT',
          entityId: id,
          newValue: { id, name: contact.name, email: contact.email, phone: contact.phone },
        });
        return contact;
      });
    },

    listDeals(user, page) {
      return repos.deals.list({ ownerId: ownerScope(user), ...page });
    },

    createDeal(user, input) {
      if (!findVisibleContact(user, input.contact_id)) {
        throw badRequest('contact_id does not reference a contact you can access');
      }
      let valueCents;
      try {
        valueCents = toCents(input.value);
      } catch (err) {
        throw badRequest(`value: ${err.message}`);
      }
      return db.transaction(() => {
        const id = repos.deals.create({
          title: input.title,
          valueCents,
          stage: input.stage,
          contactId: input.contact_id,
          ownerId: user.id,
        });
        if (input.activity_notes) {
          repos.activities.create({
            type: 'meeting',
            notes: input.activity_notes,
            contactId: input.contact_id,
            dealId: id,
            userId: user.id,
          });
        }
        const deal = repos.deals.findById(id);
        const result = { id, title: deal.title, value: deal.value, stage: deal.stage };
        repos.audit.record({
          userId: user.id,
          action: 'CREATE',
          entityType: 'DEAL',
          entityId: id,
          newValue: result,
        });
        return { ...deal, ...result };
      });
    },

    updateDealStage(user, dealId, stage) {
      const deal = repos.deals.findById(dealId);
      const scope = ownerScope(user);
      // Sales reps get 404 (not 403) for deals they do not own, to avoid leaking ids.
      if (!deal || (scope !== null && Number(deal.owner_id) !== scope)) {
        throw notFound('Deal not found');
      }
      if (deal.stage === stage) return { id: dealId, stage };
      db.transaction(() => {
        repos.deals.updateStage(dealId, stage);
        repos.audit.record({
          userId: user.id,
          action: 'UPDATE_STAGE',
          entityType: 'DEAL',
          entityId: dealId,
          oldValue: { id: dealId, stage: deal.stage },
          newValue: { id: dealId, stage },
        });
      });
      return { id: dealId, stage };
    },

    listAuditLogs(page) {
      return repos.audit.list(page);
    },

    /**
     * LGPD erasure. With `contactId`, anonymizes one data subject; without it,
     * every contact not yet anonymized.
     */
    anonymize(user, contactId) {
      if (contactId !== undefined && !repos.contacts.findById(contactId)) {
        throw notFound('Contact not found');
      }
      return db.transaction(() => {
        const ids = repos.contacts.listIdsForAnonymization(contactId);
        for (const id of ids) repos.contacts.anonymize(id, anonymizedContactFields({ id }));
        repos.audit.record({
          userId: user.id,
          action: 'ANONYMIZE',
          entityType: contactId === undefined ? 'SYSTEM' : 'CONTACT',
          entityId: contactId ?? null,
          newValue: { anonymizedContacts: ids.length },
        });
        return { anonymizedContacts: ids.length };
      });
    },
  };
}

module.exports = { createCrmService };
