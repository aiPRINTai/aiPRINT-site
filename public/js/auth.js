/**
 * Authentication system for aiPRINT
 */

class AuthManager {
  constructor() {
    this.user = null;
    this.token = localStorage.getItem('auth_token');
    this.init();
  }

  async init() {
    if (this.token) {
      await this.loadUser();
    }
    this.updateUI();
  }

  async loadUser() {
    try {
      const response = await fetch('/api/auth/me', {
        headers: {
          'Authorization': `Bearer ${this.token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        this.user = data.user;
        return true;
      } else {
        // Token invalid, clear it
        this.logout();
        return false;
      }
    } catch (error) {
      console.error('Failed to load user:', error);
      return false;
    }
  }

  async signup(email, password) {
    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Signup failed');
      }

      this.token = data.token;
      this.user = data.user;
      localStorage.setItem('auth_token', this.token);
      this.updateUI();

      return { success: true, user: data.user };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async login(email, password) {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Login failed');
      }

      this.token = data.token;
      this.user = data.user;
      localStorage.setItem('auth_token', this.token);
      this.updateUI();

      return { success: true, user: data.user };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async logout() {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.token}` }
      });
    } catch (error) {
      console.error('Logout error:', error);
    }

    this.token = null;
    this.user = null;
    localStorage.removeItem('auth_token');
    this.updateUI();
    window.location.href = '/';
  }

  isAuthenticated() {
    return !!this.user;
  }

  getAuthHeader() {
    return this.token ? { 'Authorization': `Bearer ${this.token}` } : {};
  }

  updateUI() {
    const authButton = document.getElementById('authButton');
    const creditsDisplay = document.getElementById('creditsDisplay');

    if (!authButton) return;

    if (this.user) {
      authButton.innerHTML = `
        <div class="flex items-center gap-3">
          <div class="flex items-center gap-2 px-3 py-1.5 bg-white/10 rounded-lg">
            <span class="text-yellow-300 text-sm">⚡</span>
            <span class="font-bold text-sm">${this.user.credits_balance || 0}</span>
            <span class="text-xs text-gray-400">credits</span>
          </div>
          <button onclick="auth.showAccountMenu(event)" class="btn-ghost px-3 py-1.5 text-sm">
            ${this.user.email}
          </button>
        </div>
      `;
    } else {
      authButton.innerHTML = `
        <div class="flex items-center gap-2">
          <button onclick="auth.showLoginModal()" class="btn-ghost px-4 py-2">Login</button>
          <button onclick="auth.showSignupModal()" class="btn px-4 py-2">Sign up</button>
        </div>
      `;
    }
  }

  showLoginModal() {
    const modal = this.createAuthModal('login');
    document.body.appendChild(modal);
  }

  showSignupModal() {
    const modal = this.createAuthModal('signup');
    document.body.appendChild(modal);
  }

  createAuthModal(mode) {
    const isLogin = mode === 'login';
    const container = document.createElement('div');
    container.className = 'fixed inset-0 z-[100]';
    container.innerHTML = `
      <div class="share-modal-backdrop" onclick="this.parentElement.remove()"></div>
      <div class="share-modal">
        <div class="flex justify-between items-center mb-6">
          <h3 class="text-2xl font-bold">${isLogin ? 'Welcome back' : 'Create your account'}</h3>
          <button onclick="this.closest('.fixed').remove()" class="text-gray-400 hover:text-white text-2xl">&times;</button>
        </div>

        ${!isLogin ? '<p class="text-sm text-gray-400 mb-6">Get 10 free credits to start creating!</p>' : ''}

        <form id="authForm" class="space-y-4">
          <div>
            <label class="block text-sm font-medium mb-2">Email</label>
            <input type="email" id="authEmail" required
              class="w-full px-4 py-2 bg-white/10 border border-white/20 rounded-lg focus:outline-none focus:border-white/40"
              placeholder="you@example.com">
          </div>
          <div>
            <label class="block text-sm font-medium mb-2">Password</label>
            <input type="password" id="authPassword" required minlength="8"
              class="w-full px-4 py-2 bg-white/10 border border-white/20 rounded-lg focus:outline-none focus:border-white/40"
              placeholder="${isLogin ? 'Your password' : 'At least 8 characters'}">
          </div>

          <div id="authError" class="hidden p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-sm"></div>

          <button type="submit" class="btn w-full">
            ${isLogin ? 'Login' : 'Sign up & get 10 free credits'}
          </button>
        </form>

        <div class="mt-4 text-center text-sm text-gray-400">
          ${isLogin
            ? '<span>Don\'t have an account? <a href="#" onclick="event.preventDefault(); auth.showSignupModal(); this.closest(\'.fixed\').remove()" class="text-white hover:underline">Sign up</a></span>'
            : '<span>Already have an account? <a href="#" onclick="event.preventDefault(); auth.showLoginModal(); this.closest(\'.fixed\').remove()" class="text-white hover:underline">Login</a></span>'
          }
        </div>
      </div>
    `;

    const form = container.querySelector('#authForm');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const email = document.getElementById('authEmail').value;
      const password = document.getElementById('authPassword').value;
      const errorDiv = document.getElementById('authError');
      const submitBtn = form.querySelector('button[type="submit"]');

      submitBtn.disabled = true;
      submitBtn.textContent = 'Please wait...';

      const result = isLogin
        ? await this.login(email, password)
        : await this.signup(email, password);

      if (result.success) {
        container.remove();
        // Show success message
        this.showToast(`Welcome${isLogin ? ' back' : ''}! You have ${result.user.credits_balance} credits.`, 'success');

        // Reload credits display
        if (window.credits) {
          window.credits.loadBalance();
        }
      } else {
        errorDiv.textContent = result.error;
        errorDiv.classList.remove('hidden');
        submitBtn.disabled = false;
        submitBtn.textContent = isLogin ? 'Login' : 'Sign up & get 10 free credits';
      }
    });

    return container;
  }

  showAccountMenu(event) {
    event.stopPropagation();

    // Remove existing menu if any
    const existing = document.getElementById('accountMenu');
    if (existing) {
      existing.remove();
      return;
    }

    const menu = document.createElement('div');
    menu.id = 'accountMenu';
    menu.className = 'absolute top-full right-0 mt-2 bg-[#1a1f2e] border border-white/20 rounded-lg shadow-xl py-2 min-w-[200px] z-50';
    menu.innerHTML = `
      <a href="/account.html" class="block px-4 py-2 hover:bg-white/10 transition-colors">
        <div class="font-medium">My Account</div>
        <div class="text-xs text-gray-400">${this.user.credits_balance} credits</div>
      </a>
      <hr class="border-white/10 my-2">
      <button onclick="auth.logout()" class="w-full text-left px-4 py-2 hover:bg-white/10 transition-colors text-red-400">
        Logout
      </button>
    `;

    const button = event.currentTarget;
    button.parentElement.style.position = 'relative';
    button.parentElement.appendChild(menu);

    // Close menu when clicking outside
    setTimeout(() => {
      document.addEventListener('click', function closeMenu() {
        menu.remove();
        document.removeEventListener('click', closeMenu);
      });
    }, 10);
  }

  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `fixed top-20 right-5 px-6 py-3 rounded-lg shadow-xl z-[200] transition-opacity ${
      type === 'success' ? 'bg-green-500' : type === 'error' ? 'bg-red-500' : 'bg-blue-500'
    } text-white font-medium`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }
}

// Initialize auth manager
const auth = new AuthManager();
window.auth = auth;
