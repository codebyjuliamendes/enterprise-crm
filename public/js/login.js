(function () {
  'use strict';

  var form = document.getElementById('login-form');
  var errorBox = document.getElementById('login-error');
  var submit = document.getElementById('login-submit');

  try {
    if (localStorage.getItem('token')) {
      window.location.replace('/dashboard');
      return;
    }
  } catch (e) {
    /* ignore */
  }

  function showError(message) {
    errorBox.textContent = message;
    errorBox.hidden = false;
  }

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    if (submit.disabled) return;

    var email = form.email.value.trim();
    var password = form.password.value;
    errorBox.hidden = true;
    if (!email || !password) {
      showError('Enter your email and password.');
      (email ? form.password : form.email).focus();
      return;
    }

    submit.disabled = true;
    submit.setAttribute('aria-busy', 'true');
    submit.textContent = 'Signing in...';
    try {
      var res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, password: password }),
      });
      var data = await res.json().catch(function () {
        return {};
      });
      if (!res.ok) {
        if (res.status === 429) showError('Too many attempts. Please wait a few minutes.');
        else if (res.status === 400) showError('Enter a valid email address and password.');
        else showError(data.error || 'Sign in failed.');
        form.password.select();
        return;
      }
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      window.location.replace('/dashboard');
    } catch (err) {
      showError('Could not reach the server. Check your connection and try again.');
    } finally {
      submit.disabled = false;
      submit.removeAttribute('aria-busy');
      submit.textContent = 'Sign in';
    }
  });
})();
