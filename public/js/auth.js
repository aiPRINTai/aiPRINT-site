/**
 * Authentication system for aiPRINT
 */

class AuthManager {
  constructor() {
    this.user = null;
    this.token = localStorage.getItem('auth_token');
    this.ready = this.init();
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

      // Verification-required flow: account created but no JWT issued
      if (data.verificationRequired) {
        return { success: true, verificationRequired: true, email: data.email || email };
      }

      // (Legacy fallback if backend ever returns a token directly)
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
        if (data.verificationRequired) {
          return { success: false, verificationRequired: true, email: data.email || email, error: data.error };
        }
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

  async forgotPassword(email) {
    try {
      const r = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await r.json();
      // Endpoint always returns 200 with a generic message — treat any
      // response shape as success from the UI's perspective.
      return { success: true, message: data.message };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  showForgotPasswordModal(prefillEmail = '') {
    const container = document.createElement('div');
    container.className = 'fixed inset-0 z-[100]';
    container.innerHTML = `
      <div class="share-modal-backdrop" onclick="this.parentElement.remove()"></div>
      <div class="share-modal">
        <div class="flex justify-between items-center mb-4">
          <h3 class="text-2xl font-bold">Reset your password</h3>
          <button onclick="this.closest('.fixed').remove()" class="text-gray-400 hover:text-white text-2xl">&times;</button>
        </div>
        <p class="text-sm text-gray-400 mb-5">Enter your email and we'll send you a link to set a new password.</p>

        <form id="forgotForm" class="space-y-4">
          <div>
            <label class="block text-sm font-medium mb-2">Email</label>
            <input type="email" id="forgotEmail" required inputmode="email" autocomplete="email" autocapitalize="off" autocorrect="off" spellcheck="false"
              value="${prefillEmail.replace(/"/g, '&quot;')}"
              class="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg focus:outline-none focus:border-white/40 text-base"
              placeholder="you@example.com">
          </div>

          <div id="forgotMsg" class="hidden p-3 bg-green-500/15 border border-green-500/40 rounded-lg text-sm"></div>

          <button type="submit" class="btn w-full">Send reset link</button>
        </form>

        <div class="mt-4 text-center text-sm text-gray-400">
          <a href="#" onclick="event.preventDefault(); auth.showLoginModal(); this.closest('.fixed').remove()" class="text-white hover:underline">← Back to login</a>
        </div>
      </div>
    `;
    document.body.appendChild(container);

    const form = container.querySelector('#forgotForm');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = container.querySelector('#forgotEmail').value.trim();
      const btn = form.querySelector('button[type="submit"]');
      const msg = container.querySelector('#forgotMsg');

      btn.disabled = true;
      btn.textContent = 'Sending...';

      const result = await this.forgotPassword(email);

      msg.textContent = result.message || 'If that email has an account, we\'ve sent a reset link.';
      msg.classList.remove('hidden');
      btn.textContent = 'Sent — check your inbox';
      // Leave disabled to prevent spam-clicking.
    });
  }

  async resendVerification(email) {
    try {
      const r = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Failed to resend');
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  showCheckEmail(email) {
    const container = document.createElement('div');
    container.className = 'fixed inset-0 z-[100]';
    container.innerHTML = `
      <div class="share-modal-backdrop" onclick="this.parentElement.remove()"></div>
      <div class="share-modal text-center">
        <div style="width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#818cf8);display:flex;align-items:center;justify-content:center;font-size:1.8rem;margin:0 auto 16px">📬</div>
        <h3 class="text-2xl font-bold mb-2">Check your email</h3>
        <p class="text-gray-400 mb-1">We sent a verification link to</p>
        <p class="font-semibold mb-5">${email}</p>
        <p class="text-sm text-gray-500 mb-6">Click the button in that email to activate your account. The link is valid for 24 hours.</p>
        <button id="resendBtn" class="btn-ghost px-4 py-2 mr-2">Resend email</button>
        <button onclick="this.closest('.fixed').remove()" class="btn px-4 py-2">Got it</button>
        <p id="resendMsg" class="text-xs text-green-400 mt-4 hidden">New link sent. Check your inbox.</p>
        <p class="text-xs text-gray-500 mt-4">Tip: check your spam folder if you don't see it within a minute.</p>
      </div>
    `;
    document.body.appendChild(container);

    container.querySelector('#resendBtn').addEventListener('click', async (e) => {
      e.target.disabled = true;
      e.target.textContent = 'Sending...';
      await this.resendVerification(email);
      e.target.textContent = 'Resend email';
      e.target.disabled = false;
      const msg = container.querySelector('#resendMsg');
      msg.classList.remove('hidden');
    });
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
    const mobileAuthButton = document.getElementById('mobileAuthButton');
    const creditsDisplay = document.getElementById('creditsDisplay');

    if (!authButton && !mobileAuthButton) return;

    let desktopHTML, mobileHTML;
    if (this.user) {
      desktopHTML = `
        <div class="flex items-center gap-2 sm:gap-3">
          <div class="flex items-center gap-1.5 px-2.5 py-1.5 bg-white/10 rounded-lg">
            <span class="text-yellow-300 text-sm">⚡</span>
            <span class="font-bold text-sm">${this.user.credits_balance || 0}</span>
            <span class="text-xs text-gray-400 hidden sm:inline">credits</span>
          </div>
          <button onclick="auth.showAccountMenu(event)" class="btn-ghost px-3 py-1.5 text-sm truncate max-w-[120px] sm:max-w-none">
            ${this.user.email}
          </button>
        </div>
      `;
      mobileHTML = `
        <div class="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg bg-white/5">
          <div class="flex items-center gap-2 min-w-0">
            <span class="text-yellow-300">⚡</span>
            <span class="font-bold">${this.user.credits_balance || 0}</span>
            <span class="text-xs text-gray-400">credits</span>
          </div>
          <button onclick="auth.showAccountMenu(event)" class="text-xs text-gray-300 truncate max-w-[140px]">${this.user.email}</button>
        </div>
      `;
    } else {
      desktopHTML = `
        <div class="flex items-center gap-2">
          <button onclick="auth.showLoginModal()" class="btn-ghost px-4 py-2 hidden sm:inline-flex">Login</button>
          <button onclick="auth.showSignupModal()" class="btn px-3 sm:px-4 py-2 text-sm sm:text-base">Sign up</button>
        </div>
      `;
      mobileHTML = `
        <div class="flex items-center gap-2">
          <button onclick="auth.showLoginModal()" class="btn-ghost flex-1 px-4 py-2.5">Login</button>
          <button onclick="auth.showSignupModal()" class="btn flex-1 px-4 py-2.5">Sign up</button>
        </div>
      `;
    }

    if (authButton) authButton.innerHTML = desktopHTML;
    if (mobileAuthButton) mobileAuthButton.innerHTML = mobileHTML;
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
            <input type="email" id="authEmail" required inputmode="email" autocomplete="email" autocapitalize="off" autocorrect="off" spellcheck="false"
              class="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg focus:outline-none focus:border-white/40 text-base"
              placeholder="you@example.com">
          </div>
          <div>
            <label class="block text-sm font-medium mb-2">Password</label>
            <input type="password" id="authPassword" required minlength="8" autocomplete="${isLogin ? 'current-password' : 'new-password'}"
              class="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg focus:outline-none focus:border-white/40 text-base"
              placeholder="${isLogin ? 'Your password' : 'At least 8 characters'}">
          </div>

          <div id="authError" class="hidden p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-sm"></div>

          <button type="submit" class="btn w-full">
            ${isLogin ? 'Login' : 'Sign up & get 10 free credits'}
          </button>
        </form>

        ${isLogin ? `
        <div class="mt-3 text-center text-sm">
          <a href="#" onclick="event.preventDefault(); const em = document.getElementById('authEmail')?.value || ''; this.closest('.fixed').remove(); auth.showForgotPasswordModal(em)" class="text-gray-400 hover:text-white">Forgot password?</a>
        </div>` : ''}

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

      // Signup that requires verification: close modal, show "check your email"
      if (result.success && result.verificationRequired) {
        container.remove();
        this.showCheckEmail(result.email || email);
        return;
      }

      // Login attempt against an unverified account: show resend prompt inline
      if (!result.success && result.verificationRequired) {
        errorDiv.innerHTML = `
          ${result.error || 'Please verify your email before signing in.'}
          <button type="button" id="inlineResend" class="ml-2 underline text-white">Resend verification email</button>
        `;
        errorDiv.classList.remove('hidden');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Login';
        const inline = errorDiv.querySelector('#inlineResend');
        if (inline) inline.addEventListener('click', async () => {
          inline.disabled = true; inline.textContent = 'Sending...';
          await this.resendVerification(result.email || email);
          inline.textContent = 'Sent — check your inbox';
        });
        return;
      }

      if (result.success) {
        container.remove();
        this.showToast(`Welcome${isLogin ? ' back' : ''}! You have ${result.user.credits_balance} credits.`, 'success');
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
