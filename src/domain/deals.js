'use strict';

/** Pipeline stages, in board order. Must match the CHECK constraint on deals.stage. */
const STAGES = Object.freeze(['Lead', 'Qualified', 'Proposal', 'Won', 'Lost']);

module.exports = { STAGES };
