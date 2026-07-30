document.addEventListener('DOMContentLoaded', () => {
  const token = localStorage.getItem('token');
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  
  if (!token) {
    window.location.href = '/'; // or /login
    return;
  }

  // Setup User Info
  document.querySelector('#user-info span').textContent = `${user.name} (${user.role})`;
  
  // Setup Role-based Nav
  document.querySelectorAll('[data-role-restricted="true"]').forEach(el => {
    const allowedRoles = el.getAttribute('data-roles').split(',');
    if (!allowedRoles.includes(user.role)) {
      el.remove();
    }
  });

  // Navigation Logic
  document.querySelectorAll('.nav-links li').forEach(li => {
    li.addEventListener('click', (e) => {
      document.querySelectorAll('.nav-links li').forEach(n => n.classList.remove('active'));
      e.target.classList.add('active');
      
      const target = e.target.getAttribute('data-target');
      document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));
      document.getElementById(target).classList.add('active');
      
      loadData(target);
    });
  });

  // Logout
  document.getElementById('logout-btn').addEventListener('click', () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/';
  });

  // Theme Toggle
  document.getElementById('theme-toggle').addEventListener('click', () => {
    document.documentElement.classList.toggle('dark');
  });

  // API Fetch Wrapper
  const apiFetch = async (url, options = {}) => {
    options.headers = {
      ...options.headers,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
    const res = await fetch(url, options);
    if (res.status === 401 || res.status === 403) {
      localStorage.removeItem('token');
      window.location.href = '/';
    }
    return res.json();
  };

  // Load Data based on section
  const loadData = async (section) => {
    if (section === 'overview') {
      const stats = await apiFetch('/api/stats');
      document.getElementById('kpi-contacts').textContent = stats.contactsCount || 0;
      document.getElementById('kpi-deals').textContent = stats.dealsCount || 0;
      document.getElementById('kpi-revenue').textContent = `$${(stats.totalRevenue || 0).toLocaleString()}`;
    }
    
    if (section === 'contacts') {
      const contacts = await apiFetch('/api/contacts');
      const tbody = document.querySelector('#contacts-table tbody');
      tbody.innerHTML = contacts.map(c => `
        <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
          <td class="px-6 py-4">${c.name}</td>
          <td class="px-6 py-4">${c.email}</td>
          <td class="px-6 py-4">${c.phone || '-'}</td>
        </tr>
      `).join('');
    }
    
    if (section === 'deals') {
      const deals = await apiFetch('/api/deals');
      document.querySelectorAll('.kanban-items').forEach(el => el.innerHTML = '');
      
      deals.forEach(deal => {
        const col = document.querySelector(`.kanban-col[data-stage="${deal.stage}"] .kanban-items`);
        if (col) {
          const card = document.createElement('div');
          card.className = 'kanban-card bg-white dark:bg-slate-700 p-4 rounded-lg shadow-sm border border-slate-200 dark:border-slate-600 cursor-pointer hover:shadow-md transition-shadow';
          card.innerHTML = `<strong class="text-slate-900 dark:text-white">${deal.title}</strong><br><span class="text-blue-600 dark:text-blue-400 font-medium">$${deal.value.toLocaleString()}</span><br><small class="text-slate-500 dark:text-slate-400">${deal.contact_name}</small>`;
          col.appendChild(card);
        }
      });
    }
    
    if (section === 'audit' && user.role === 'admin') {
      const logs = await apiFetch('/api/audit-logs');
      const tbody = document.querySelector('#audit-table tbody');
      tbody.innerHTML = logs.map(l => `
        <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
          <td class="px-6 py-4">${new Date(l.created_at).toLocaleString()}</td>
          <td class="px-6 py-4">${l.user_name}</td>
          <td class="px-6 py-4">${l.action}</td>
          <td class="px-6 py-4">${l.entity_type}</td>
          <td class="px-6 py-4">${l.entity_id}</td>
        </tr>
      `).join('');
    }
  };

  // Initial Load
  loadData('overview');
});
