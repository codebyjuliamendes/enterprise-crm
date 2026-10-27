'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { createTestApp, DEMO_PASSWORD } = require('./helpers');

test('authentication', async (t) => {
  const ctx = await createTestApp();

  await t.test('login succeeds case-insensitively and returns a token', async () => {
    const res = await ctx
      .request()
      .post('/api/login')
      .send({ email: ' Admin@CRM.com ', password: DEMO_PASSWORD });
    assert.equal(res.status, 200);
    assert.ok(res.body.token);
    assert.deepEqual(res.body.user, { id: 1, name: 'System Admin', role: 'admin' });
  });

  await t.test('wrong password and unknown user give the same 401', async () => {
    const a = await ctx
      .request()
      .post('/api/login')
      .send({ email: 'admin@crm.com', password: 'x' });
    const b = await ctx
      .request()
      .post('/api/login')
      .send({ email: 'nobody@crm.com', password: 'x' });
    assert.equal(a.status, 401);
    assert.equal(b.status, 401);
    assert.equal(a.body.error, b.body.error);
  });

  await t.test('missing fields are a 400 with details', async () => {
    const res = await ctx.request().post('/api/login').send({ email: 'admin@crm.com' });
    assert.equal(res.status, 400);
    assert.ok(Array.isArray(res.body.details));
  });

  await t.test('malformed JSON is a 400, not a 500', async () => {
    const res = await ctx
      .request()
      .post('/api/login')
      .set('Content-Type', 'application/json')
      .send('{"email":');
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'Malformed JSON body');
  });

  await t.test('protected routes reject missing, malformed and forged tokens', async () => {
    assert.equal((await ctx.request().get('/api/me')).status, 401);
    assert.equal(
      (await ctx.request().get('/api/me').set('Authorization', 'Token abc')).status,
      401,
    );
    const forged = jwt.sign({ sub: '1', role: 'admin' }, 'another-secret-another-secret-123');
    const res = await ctx.request().get('/api/me').set('Authorization', `Bearer ${forged}`);
    assert.equal(res.status, 401);
    const none = jwt.sign({ sub: '1', role: 'admin' }, '', { algorithm: 'none' });
    assert.equal(
      (await ctx.request().get('/api/me').set('Authorization', `Bearer ${none}`)).status,
      401,
    );
  });

  await t.test('role comes from the database, not from the token claims', async () => {
    const token = jwt.sign({ sub: '4', role: 'admin' }, ctx.config.jwt.secret, {
      algorithm: 'HS256',
    });
    const me = await ctx.request().get('/api/me').set('Authorization', `Bearer ${token}`);
    assert.equal(me.body.user.role, 'viewer');
    const audit = await ctx
      .request()
      .get('/api/audit-logs')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(audit.status, 403);
  });

  await t.test('deactivated users are rejected immediately', async () => {
    const token = await ctx.login('viewer');
    ctx.db.run('UPDATE users SET active = 0 WHERE email = ?', ['viewer@crm.com']);
    const res = await ctx.request().get('/api/me').set('Authorization', `Bearer ${token}`);
    assert.equal(res.status, 401);
    const login = await ctx
      .request()
      .post('/api/login')
      .send({ email: 'viewer@crm.com', password: DEMO_PASSWORD });
    assert.equal(login.status, 403);
  });
});

test('login is rate limited', async () => {
  const ctx = await createTestApp({ rateLimits: { login: 3 } });
  for (let i = 0; i < 3; i += 1) {
    await ctx.request().post('/api/login').send({ email: 'admin@crm.com', password: 'bad' });
  }
  const res = await ctx
    .request()
    .post('/api/login')
    .send({ email: 'admin@crm.com', password: 'bad' });
  assert.equal(res.status, 429);
});

test('contacts', async (t) => {
  const ctx = await createTestApp();

  await t.test('sales reps create contacts they own, with an audit entry', async () => {
    const sales = await ctx.as('sales');
    const res = await sales
      .post('/api/contacts')
      .send({ name: '  Bob  ', email: 'BOB@Example.com', phone: '+55 (11) 99999-0000' });
    assert.equal(res.status, 201);
    assert.equal(res.body.name, 'Bob');
    assert.equal(res.body.email, 'bob@example.com');
    assert.equal(res.body.owner_id, 3);
    assert.match(res.body.created_at, /Z$/);

    const admin = await ctx.as('admin');
    const logs = await admin.get('/api/audit-logs');
    const entry = logs.body.find((l) => l.entity_type === 'CONTACT' && l.entity_id === res.body.id);
    assert.equal(entry.action, 'CREATE');
  });

  await t.test('validation rejects bad input', async () => {
    const sales = await ctx.as('sales');
    const cases = [
      {},
      { name: 'x', email: 'not-an-email' },
      { name: '', email: 'a@b.co' },
      { name: 'x', email: 'a@b.co', phone: '<script>' },
      { name: 'x', email: 'a@b.co', company_id: 999 },
    ];
    for (const body of cases) {
      const res = await sales.post('/api/contacts').send(body);
      assert.equal(res.status, 400, JSON.stringify(body));
    }
  });

  await t.test('viewers cannot create contacts', async () => {
    const viewer = await ctx.as('viewer');
    const res = await viewer.post('/api/contacts').send({ name: 'x', email: 'x@y.co' });
    assert.equal(res.status, 403);
  });

  await t.test('sales reps only list their own contacts; managers see all', async () => {
    const manager = await ctx.as('manager');
    await manager.post('/api/contacts').send({ name: 'Manager Lead', email: 'm@lead.co' });
    const sales = await ctx.as('sales');
    const own = await sales.get('/api/contacts');
    assert.ok(own.body.every((c) => c.owner_id === 3));
    const all = await manager.get('/api/contacts');
    assert.ok(all.body.length > own.body.length);
  });

  await t.test('pagination is validated and applied', async () => {
    const admin = await ctx.as('admin');
    assert.equal((await admin.get('/api/contacts?limit=1')).body.length, 1);
    assert.equal((await admin.get('/api/contacts?limit=0')).status, 400);
    assert.equal((await admin.get('/api/contacts?limit=abc')).status, 400);
  });
});

test('deals', async (t) => {
  const ctx = await createTestApp();
  const sales = await ctx.as('sales');
  const manager = await ctx.as('manager');
  const managerContact = (
    await manager.post('/api/contacts').send({ name: 'Mgr Contact', email: 'mc@x.co' })
  ).body;

  await t.test(
    'creates a deal with activity in one transaction and stores money in cents',
    async () => {
      const res = await sales
        .post('/api/deals')
        .send({ title: 'Renewal', value: 1234.56, contact_id: 1, activity_notes: 'Kick-off call' });
      assert.equal(res.status, 201);
      assert.equal(res.body.value, 1234.56);
      assert.equal(res.body.stage, 'Lead');
      const row = ctx.db.get('SELECT value_cents FROM deals WHERE id = ?', [res.body.id]);
      assert.equal(row.value_cents, 123456);
      const act = ctx.db.get('SELECT type, notes FROM activities WHERE deal_id = ?', [res.body.id]);
      assert.deepEqual({ ...act }, { type: 'meeting', notes: 'Kick-off call' });
    },
  );

  await t.test('rejects invalid stage, value and contact', async () => {
    const bad = [
      { title: 'x', value: 1, contact_id: 1, stage: 'Closed' },
      { title: 'x', value: -1, contact_id: 1 },
      { title: 'x', value: '100', contact_id: 1 },
      { title: 'x', value: 1.001, contact_id: 1 },
      { title: 'x', value: 1, contact_id: 9999 },
      { title: 'x', value: 1, contact_id: managerContact.id }, // not owned by the sales rep
    ];
    for (const body of bad) {
      const res = await sales.post('/api/deals').send(body);
      assert.equal(res.status, 400, JSON.stringify(body));
    }
    const count = ctx.db.get('SELECT COUNT(*) AS n FROM deals').n;
    assert.equal(count, 2);
  });

  await t.test('stage update validates the stage and records old and new values', async () => {
    const deal = (
      await sales.post('/api/deals').send({ title: 'Upsell', value: 500, contact_id: 1 })
    ).body;
    assert.equal(
      (await sales.put(`/api/deals/${deal.id}/stage`).send({ stage: 'Nope' })).status,
      400,
    );
    const res = await sales.put(`/api/deals/${deal.id}/stage`).send({ stage: 'Won' });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { id: deal.id, stage: 'Won' });
    const log = ctx.db.get(
      "SELECT old_value, new_value FROM audit_logs WHERE action = 'UPDATE_STAGE' AND entity_id = ?",
      [deal.id],
    );
    assert.equal(JSON.parse(log.old_value).stage, 'Lead');
    assert.equal(JSON.parse(log.new_value).stage, 'Won');
  });

  await t.test('unknown deal is 404 and sales reps cannot move other reps deals', async () => {
    assert.equal((await manager.put('/api/deals/9999/stage').send({ stage: 'Won' })).status, 404);
    assert.equal((await manager.put('/api/deals/abc/stage').send({ stage: 'Won' })).status, 400);
    const mgrDeal = (
      await manager
        .post('/api/deals')
        .send({ title: 'Mgr', value: 1, contact_id: managerContact.id })
    ).body;
    const res = await sales.put(`/api/deals/${mgrDeal.id}/stage`).send({ stage: 'Lost' });
    assert.equal(res.status, 404);
    assert.equal(ctx.db.get('SELECT stage FROM deals WHERE id = ?', [mgrDeal.id]).stage, 'Lead');
  });

  await t.test('stats are scoped and sum money exactly', async () => {
    const s = (await sales.get('/api/stats')).body;
    assert.equal(s.totalRevenue, 500);
    assert.equal(s.dealsCount, 3);
    assert.equal(s.openDealsCount, 2);
    assert.equal(s.pipelineValue, 151234.56);
    const m = (await manager.get('/api/stats')).body;
    assert.equal(m.dealsCount, 4);
  });

  await t.test('list includes contact names and is scoped for sales', async () => {
    const list = (await sales.get('/api/deals')).body;
    assert.ok(list.every((d) => d.owner_id === 3));
    assert.ok(list.some((d) => d.contact_name === 'Alice Boss'));
  });
});

test('audit log and LGPD anonymization', async (t) => {
  const ctx = await createTestApp();
  const admin = await ctx.as('admin');
  const manager = await ctx.as('manager');
  const c = (
    await manager
      .post('/api/contacts')
      .send({ name: 'Carla', email: 'carla@x.co', phone: '123456' })
  ).body;
  await manager
    .post('/api/deals')
    .send({ title: 'D', value: 1, contact_id: c.id, activity_notes: 'Carla said hi' });

  await t.test('only admins can read the audit log or anonymize', async () => {
    assert.equal((await manager.get('/api/audit-logs')).status, 403);
    assert.equal(
      (await manager.post('/api/lgpd/anonymize').send({ confirm: 'ANONYMIZE' })).status,
      403,
    );
  });

  await t.test('anonymization requires explicit confirmation', async () => {
    const res = await admin.post('/api/lgpd/anonymize').send({});
    assert.equal(res.status, 400);
    assert.equal(ctx.db.get('SELECT name FROM contacts WHERE id = ?', [c.id]).name, 'Carla');
  });

  await t.test('anonymizes a single contact irreversibly, including activity notes', async () => {
    const res = await admin
      .post('/api/lgpd/anonymize')
      .send({ confirm: 'ANONYMIZE', contact_id: c.id });
    assert.equal(res.status, 200);
    assert.equal(res.body.anonymizedContacts, 1);
    const row = ctx.db.get('SELECT * FROM contacts WHERE id = ?', [c.id]);
    assert.equal(row.name, `Anonymized contact #${c.id}`);
    assert.equal(row.email, null);
    assert.equal(row.phone, null);
    assert.ok(row.anonymized_at);
    assert.equal(
      ctx.db.get('SELECT notes FROM activities WHERE contact_id = ?', [c.id]).notes,
      null,
    );
    assert.equal(ctx.db.get('SELECT name FROM contacts WHERE id = 1').name, 'Alice Boss');
  });

  await t.test('anonymizing everything skips already anonymized contacts', async () => {
    const res = await admin.post('/api/lgpd/anonymize').send({ confirm: 'ANONYMIZE' });
    assert.equal(res.body.anonymizedContacts, 1);
    assert.equal(
      (await admin.post('/api/lgpd/anonymize').send({ confirm: 'ANONYMIZE', contact_id: 999 }))
        .status,
      404,
    );
  });

  await t.test('audit entries are newest first with ISO UTC dates', async () => {
    const logs = (await admin.get('/api/audit-logs')).body;
    assert.equal(logs[0].action, 'ANONYMIZE');
    assert.equal(logs[0].user_name, 'System Admin');
    assert.match(logs[0].created_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    for (let i = 1; i < logs.length; i += 1) assert.ok(logs[i - 1].id > logs[i].id);
  });
});

test('transactions roll back the write when the audit entry fails', async () => {
  const ctx = await createTestApp();
  const sales = await ctx.as('sales');
  const { audit } = ctx.app.locals.services.repos;
  const original = audit.record;
  audit.record = () => {
    throw new Error('disk full');
  };
  try {
    const res = await sales.post('/api/contacts').send({ name: 'Ghost', email: 'ghost@x.co' });
    assert.equal(res.status, 500);
    assert.equal(res.body.error, 'Internal Server Error');
    assert.ok(res.body.requestId);
    assert.equal(ctx.db.get("SELECT COUNT(*) AS n FROM contacts WHERE name = 'Ghost'").n, 0);
  } finally {
    audit.record = original;
  }
});

test('HTTP surface', async (t) => {
  const ctx = await createTestApp();

  await t.test('health check reports ok as JSON', async () => {
    const res = await ctx.request().get('/health');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { status: 'ok' });
  });

  await t.test('pages are served with a strict CSP and security headers', async () => {
    for (const url of ['/', '/login', '/dashboard', '/dashboard.html', '/api-docs']) {
      const res = await ctx.request().get(url);
      assert.equal(res.status, 200, url);
      assert.match(res.headers['content-type'], /html/);
    }
    const res = await ctx.request().get('/');
    assert.match(res.headers['content-security-policy'], /script-src 'self'/);
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.equal(res.headers['x-powered-by'], undefined);
  });

  await t.test('swagger assets and spec are served locally', async () => {
    assert.equal((await ctx.request().get('/swagger.json')).status, 200);
    assert.equal((await ctx.request().get('/vendor/swagger-ui/swagger-ui-bundle.js')).status, 200);
  });

  await t.test('unknown routes are 404', async () => {
    assert.equal((await ctx.request().get('/does-not-exist')).status, 404);
    const admin = await ctx.as('admin');
    const res = await admin.get('/api/does-not-exist');
    assert.equal(res.status, 404);
    assert.equal(res.body.error, 'Route not found');
  });

  await t.test('CORS is closed by default', async () => {
    const res = await ctx.request().get('/health').set('Origin', 'https://evil.example');
    assert.equal(res.headers['access-control-allow-origin'], undefined);
  });

  await t.test('request ids are propagated', async () => {
    const res = await ctx.request().get('/health').set('X-Request-Id', 'abc-123');
    assert.equal(res.headers['x-request-id'], 'abc-123');
  });
});
