'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { unauthorized, forbidden } = require('../domain/errors');

const BCRYPT_ROUNDS = 12;
// Compared against when the e-mail does not exist so response time does not reveal valid accounts.
const DUMMY_HASH = bcrypt.hashSync('timing-safe-dummy-password', BCRYPT_ROUNDS);

const publicUser = (u) => ({ id: Number(u.id), name: u.name, email: u.email, role: u.role });

/**
 * @param {{ repos: ReturnType<import('../repositories').createRepositories>,
 *           jwt: { secret: string, expiresIn: string } }} deps
 */
function createAuthService({ repos, jwt: jwtConfig }) {
  return {
    async login(email, password) {
      const user = repos.users.findByEmail(email);
      const match = await bcrypt.compare(password, user ? String(user.password) : DUMMY_HASH);
      if (!user || !match) throw unauthorized('Invalid credentials');
      if (!user.active) throw forbidden('Account disabled');

      const token = jwt.sign({ sub: String(user.id), role: user.role }, jwtConfig.secret, {
        algorithm: 'HS256',
        expiresIn: jwtConfig.expiresIn,
      });
      return { token, user: { id: Number(user.id), name: user.name, role: user.role } };
    },

    /**
     * Verifies a bearer token and reloads the user so deactivated accounts and role
     * changes take effect immediately instead of when the token expires.
     */
    authenticate(token) {
      let payload;
      try {
        payload = jwt.verify(token, jwtConfig.secret, { algorithms: ['HS256'] });
      } catch {
        throw unauthorized('Invalid or expired token');
      }
      const id = Number(payload.sub ?? payload.id);
      const user = Number.isInteger(id) ? repos.users.findById(id) : null;
      if (!user || !user.active) throw unauthorized('Invalid or expired token');
      return publicUser(user);
    },
  };
}

const hashPassword = (password) => bcrypt.hash(password, BCRYPT_ROUNDS);

module.exports = { createAuthService, hashPassword, BCRYPT_ROUNDS };
