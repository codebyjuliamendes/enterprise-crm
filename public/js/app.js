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

  // Toast System
  window.showToast = (message, type = 'success') => {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    const iconName = type === 'success' ? 'check-circle' : (type === 'error' ? 'alert-circle' : 'info');
    const colorClass = type === 'success' ? 'text-green-500' : (type === 'error' ? 'text-red-500' : 'text-blue-500');
    
    toast.className = `flex items-center gap-3 bg-white/80 dark:bg-slate-800/80 backdrop-blur-md border border-slate-200 dark:border-slate-700 px-4 py-3 rounded-lg shadow-lg transform transition-all duration-300 translate-y-5 opacity-0`;
    toast.innerHTML = `<i data-lucide="${iconName}" class="w-5 h-5 ${colorClass}"></i><span class="text-sm font-medium text-slate-800 dark:text-slate-100">${message}</span>`;
    
    container.appendChild(toast);
    lucide.createIcons({ root: toast });
    
    requestAnimationFrame(() => {
      toast.classList.remove('translate-y-5', 'opacity-0');
    });

    setTimeout(() => {
      toast.classList.add('translate-y-5', 'opacity-0');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
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
      const tbody = document.querySelector('#contacts-table tbody');
      // Skeleton
      tbody.innerHTML = Array(5).fill().map(() => `
        <tr>
          <td class="px-6 py-4"><div class="h-4 bg-slate-200 dark:bg-slate-700 rounded animate-pulse w-3/4"></div></td>
          <td class="px-6 py-4"><div class="h-4 bg-slate-200 dark:bg-slate-700 rounded animate-pulse w-1/2"></div></td>
          <td class="px-6 py-4"><div class="h-4 bg-slate-200 dark:bg-slate-700 rounded animate-pulse w-2/3"></div></td>
        </tr>
      `).join('');
      
      const contacts = await apiFetch('/api/contacts');
      tbody.innerHTML = contacts.map(c => `
        <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
          <td class="px-6 py-4">${c.name}</td>
          <td class="px-6 py-4">${c.email}</td>
          <td class="px-6 py-4">${c.phone || '-'}</td>
        </tr>
      `).join('');
      window.showToast('Contacts loaded', 'success');
    }
    
    if (section === 'deals') {
      document.querySelectorAll('.kanban-items').forEach(el => {
        el.innerHTML = Array(2).fill().map(() => `
          <div class="bg-white dark:bg-slate-700 p-4 rounded-lg shadow-sm border border-slate-200 dark:border-slate-600 animate-pulse">
            <div class="h-4 bg-slate-200 dark:bg-slate-600 rounded w-3/4 mb-2"></div>
            <div class="h-4 bg-slate-200 dark:bg-slate-600 rounded w-1/2 mb-2"></div>
            <div class="h-3 bg-slate-200 dark:bg-slate-600 rounded w-full"></div>
          </div>
        `).join('');
      });
      
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
      window.showToast('Deals loaded', 'success');
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
    
    // Re-initialize any dynamic icons that may have been added
    if (window.lucide) {
      lucide.createIcons();
    }
  };

  // Initial Load
  loadData('overview');
});
