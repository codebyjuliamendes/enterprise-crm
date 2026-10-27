(function () {
  'use strict';

  var STAGES = ['Lead', 'Qualified', 'Proposal', 'Won', 'Lost'];
  var WRITE_ROLES = ['admin', 'manager', 'sales'];
  var VIEWS = {
    overview: { title: 'Overview', roles: null },
    contacts: { title: 'Contacts', roles: null },
    deals: { title: 'Pipeline', roles: null },
    audit: { title: 'Audit logs', roles: ['admin'] },
  };

  var token = null;
  try {
    token = localStorage.getItem('token');
  } catch (e) {
    token = null;
  }
  if (!token) {
    window.location.replace('/login');
    return;
  }

  var currentUser = readStoredUser();
  var currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
  var dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  var date = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

  function readStoredUser() {
    try {
      return JSON.parse(localStorage.getItem('user') || 'null');
    } catch (e) {
      return null;
    }
  }

  function $(selector, root) {
    return (root || document).querySelector(selector);
  }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (key) {
      if (key === 'text') node.textContent = attrs[key];
      else if (key === 'className') node.className = attrs[key];
      else node.setAttribute(key, attrs[key]);
    });
    (children || []).forEach(function (child) {
      if (child) node.appendChild(child);
    });
    return node;
  }

  function formatDate(value, withTime) {
    if (!value) return '-';
    var d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return (withTime ? dateTime : date).format(d);
  }

  function canWrite() {
    return currentUser && WRITE_ROLES.indexOf(currentUser.role) !== -1;
  }

  function logout() {
    try {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    } catch (e) {
      /* ignore */
    }
    window.location.replace('/login');
  }

  /** Fetch wrapper: JSON in/out, bearer token, session expiry handling. */
  async function api(url, options) {
    var opts = options || {};
    var headers = { Authorization: 'Bearer ' + token };
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    var res = await fetch(url, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    var data = await res.json().catch(function () {
      return null;
    });
    if (res.status === 401) {
      logout();
      throw new Error('Your session has expired.');
    }
    if (!res.ok) {
      var message = (data && data.error) || 'Request failed (' + res.status + ')';
      if (data && Array.isArray(data.details) && data.details.length) {
        message +=
          ': ' +
          data.details
            .map(function (d) {
              return d.field + ' ' + d.message;
            })
            .join('; ');
      }
      var error = new Error(message);
      error.status = res.status;
      throw error;
    }
    return data;
  }

  function toast(message, type) {
    var container = $('#toast-container');
    var node = el('div', {
      className: 'toast' + (type === 'error' ? ' error' : ''),
      text: message,
    });
    container.appendChild(node);
    setTimeout(function () {
      node.remove();
    }, 4000);
  }

  function setState(id, message, isError) {
    var node = document.getElementById(id);
    node.textContent = message || '';
    node.hidden = !message;
    node.classList.toggle('error', !!isError);
  }

  function skeletonRows(tbody, columns, rows) {
    tbody.replaceChildren();
    for (var r = 0; r < rows; r += 1) {
      var tr = el('tr', { 'aria-hidden': 'true' });
      for (var c = 0; c < columns; c += 1) {
        tr.appendChild(el('td', {}, [el('span', { className: 'skeleton' })]));
      }
      tbody.appendChild(tr);
    }
  }

  // ---------- Theme ----------
  function effectiveTheme() {
    var explicit = document.documentElement.getAttribute('data-theme');
    if (explicit) return explicit;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function syncThemeButton() {
    var dark = effectiveTheme() === 'dark';
    var btn = $('#theme-toggle');
    btn.setAttribute('aria-pressed', String(dark));
    $('span', btn).textContent = dark ? 'Light mode' : 'Dark mode';
  }

  $('#theme-toggle').addEventListener('click', function () {
    var next = effectiveTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('theme', next);
    } catch (e) {
      /* ignore */
    }
    syncThemeButton();
  });
  syncThemeButton();

  $('#logout-btn').addEventListener('click', logout);

  // ---------- User / roles ----------
  function applyUser() {
    var badge = $('#user-info strong');
    badge.textContent = currentUser ? currentUser.name + ' (' + currentUser.role + ')' : '...';
    document.querySelectorAll('[data-roles]').forEach(function (node) {
      var roles = node.getAttribute('data-roles').split(',');
      node.hidden = !(currentUser && roles.indexOf(currentUser.role) !== -1);
    });
    document.querySelectorAll('[data-write-only]').forEach(function (node) {
      node.hidden = !canWrite();
    });
  }

  // ---------- Views ----------
  async function loadOverview() {
    setState('overview-error', '');
    try {
      var stats = await api('/api/stats');
      $('#kpi-contacts').textContent = String(stats.contactsCount);
      $('#kpi-open-deals').textContent = String(stats.openDealsCount);
      $('#kpi-pipeline').textContent = currency.format(stats.pipelineValue || 0);
      $('#kpi-revenue').textContent = currency.format(stats.totalRevenue || 0);
    } catch (err) {
      setState('overview-error', 'Could not load statistics. ' + err.message, true);
    }
  }

  async function loadContacts() {
    var tbody = $('#contacts-table tbody');
    setState('contacts-state', '');
    skeletonRows(tbody, 4, 3);
    try {
      var contacts = await api('/api/contacts');
      tbody.replaceChildren();
      contacts.forEach(function (c) {
        tbody.appendChild(
          el('tr', {}, [
            el('td', { text: c.name }),
            el('td', { text: c.email || '-' }),
            el('td', { text: c.phone || '-' }),
            el('td', { text: formatDate(c.created_at, false) }),
          ]),
        );
      });
      if (!contacts.length) setState('contacts-state', 'No contacts yet.');
      return contacts;
    } catch (err) {
      tbody.replaceChildren();
      setState('contacts-state', 'Could not load contacts. ' + err.message, true);
      return [];
    }
  }

  function buildKanban() {
    var board = $('#kanban-board');
    board.replaceChildren();
    STAGES.forEach(function (stage) {
      var headingId = 'stage-' + stage.toLowerCase();
      var col = el(
        'section',
        { className: 'kanban-col', 'data-stage': stage, 'aria-labelledby': headingId },
        [
          el('h3', { id: headingId }, [
            el('span', { text: stage }),
            el('span', { className: 'count', text: '0' }),
          ]),
          el('ul', { className: 'kanban-list' }),
        ],
      );
      board.appendChild(col);
    });
  }

  function dealCard(deal) {
    var li = el('li', { className: 'deal-card' }, [
      el('span', { className: 'deal-title', text: deal.title }),
      el('span', { className: 'deal-value', text: currency.format(deal.value || 0) }),
      el('span', { className: 'deal-contact', text: deal.contact_name || 'No contact' }),
    ]);
    if (canWrite()) {
      var selectId = 'deal-stage-' + deal.id;
      var select = el('select', { id: selectId, 'data-deal-id': String(deal.id) });
      STAGES.forEach(function (s) {
        var opt = el('option', { value: s, text: s });
        if (s === deal.stage) opt.selected = true;
        select.appendChild(opt);
      });
      select.addEventListener('change', onStageChange);
      li.appendChild(
        el('label', { for: selectId, className: 'sr-only', text: 'Stage for ' + deal.title }),
      );
      li.appendChild(select);
    }
    return li;
  }

  async function onStageChange(event) {
    var select = event.target;
    var id = select.getAttribute('data-deal-id');
    select.disabled = true;
    try {
      await api('/api/deals/' + encodeURIComponent(id) + '/stage', {
        method: 'PUT',
        body: { stage: select.value },
      });
      toast('Deal moved to ' + select.value);
      await loadDeals();
    } catch (err) {
      toast('Could not update the deal: ' + err.message, 'error');
      await loadDeals();
    }
  }

  async function loadDeals() {
    buildKanban();
    setState('deals-state', 'Loading pipeline...');
    try {
      var deals = await api('/api/deals');
      setState('deals-state', deals.length ? '' : 'No deals yet.');
      STAGES.forEach(function (stage) {
        var col = $('.kanban-col[data-stage="' + stage + '"]');
        var list = $('.kanban-list', col);
        var inStage = deals.filter(function (d) {
          return d.stage === stage;
        });
        $('.count', col).textContent = String(inStage.length);
        if (!inStage.length)
          list.appendChild(el('li', { className: 'empty-col', text: 'No deals' }));
        inStage.forEach(function (d) {
          list.appendChild(dealCard(d));
        });
      });
    } catch (err) {
      setState('deals-state', 'Could not load deals. ' + err.message, true);
    }
  }

  async function fillContactSelect() {
    var select = $('#deal-contact');
    try {
      var contacts = await api('/api/contacts?limit=500');
      var previous = select.value;
      select.replaceChildren(el('option', { value: '', text: 'Select a contact' }));
      contacts.forEach(function (c) {
        select.appendChild(el('option', { value: String(c.id), text: c.name }));
      });
      select.value = previous;
    } catch (err) {
      toast('Could not load contacts for the deal form.', 'error');
    }
  }

  async function loadAudit() {
    var tbody = $('#audit-table tbody');
    setState('audit-state', '');
    skeletonRows(tbody, 5, 3);
    try {
      var logs = await api('/api/audit-logs');
      tbody.replaceChildren();
      logs.forEach(function (l) {
        tbody.appendChild(
          el('tr', {}, [
            el('td', { text: formatDate(l.created_at, true) }),
            el('td', { text: l.user_name || 'Unknown' }),
            el('td', { className: 'mono', text: l.action }),
            el('td', { className: 'mono', text: l.entity_type }),
            el('td', { className: 'mono', text: l.entity_id == null ? '-' : String(l.entity_id) }),
          ]),
        );
      });
      if (!logs.length) setState('audit-state', 'No audit entries yet.');
    } catch (err) {
      tbody.replaceChildren();
      setState('audit-state', 'Could not load audit logs. ' + err.message, true);
    }
  }

  var loaders = {
    overview: loadOverview,
    contacts: loadContacts,
    deals: function () {
      if (canWrite()) fillContactSelect();
      return loadDeals();
    },
    audit: loadAudit,
  };

  function viewAllowed(name) {
    var view = VIEWS[name];
    return !!view && (!view.roles || (currentUser && view.roles.indexOf(currentUser.role) !== -1));
  }

  function showView(name, focus) {
    if (!viewAllowed(name)) name = 'overview';
    document.querySelectorAll('[data-view-section]').forEach(function (section) {
      section.hidden = section.getAttribute('data-view-section') !== name;
    });
    document.querySelectorAll('.nav a').forEach(function (a) {
      if (a.getAttribute('data-view') === name) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    $('#view-title').textContent = VIEWS[name].title;
    document.title = VIEWS[name].title + ' - Enterprise CRM';
    if (focus) $('#main').focus();
    loaders[name]();
  }

  window.addEventListener('hashchange', function () {
    showView(location.hash.slice(1), true);
  });

  // ---------- Forms ----------
  function bindForm(form, buildBody, url, onSuccess) {
    var errorBox = $('[data-form-error]', form);
    var button = $('button[type="submit"]', form);
    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      if (button.disabled) return;
      errorBox.hidden = true;
      if (!form.checkValidity()) {
        var invalid = form.querySelector(':invalid');
        errorBox.textContent = 'Please fill in the required fields correctly.';
        errorBox.hidden = false;
        if (invalid) invalid.focus();
        return;
      }
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      try {
        await api(url, { method: 'POST', body: buildBody(form) });
        form.reset();
        await onSuccess();
      } catch (err) {
        errorBox.textContent = err.message;
        errorBox.hidden = false;
      } finally {
        button.disabled = false;
        button.removeAttribute('aria-busy');
      }
    });
  }

  function optional(value) {
    var v = value.trim();
    return v ? v : null;
  }

  bindForm(
    $('#contact-form'),
    function (form) {
      return {
        name: form.name.value.trim(),
        email: form.email.value.trim(),
        phone: optional(form.phone.value),
        tags: optional(form.tags.value),
      };
    },
    '/api/contacts',
    async function () {
      toast('Contact saved');
      await loadContacts();
    },
  );

  var stageSelect = $('#deal-stage');
  STAGES.forEach(function (s) {
    stageSelect.appendChild(el('option', { value: s, text: s }));
  });

  bindForm(
    $('#deal-form'),
    function (form) {
      return {
        title: form.title.value.trim(),
        value: Number(form.value.value),
        contact_id: Number(form.contact_id.value),
        stage: form.stage.value,
        activity_notes: optional(form.activity_notes.value),
      };
    },
    '/api/deals',
    async function () {
      toast('Deal saved');
      await loadDeals();
    },
  );

  // ---------- Boot ----------
  applyUser();
  showView(location.hash.slice(1) || 'overview', false);
  api('/api/me')
    .then(function (data) {
      currentUser = data.user;
      try {
        localStorage.setItem('user', JSON.stringify(currentUser));
      } catch (e) {
        /* ignore */
      }
      var before = location.hash.slice(1) || 'overview';
      applyUser();
      if (!viewAllowed(before)) showView('overview', false);
      else if (before === 'deals') showView('deals', false);
    })
    .catch(function () {
      /* api() already redirects on 401 */
    });
})();
