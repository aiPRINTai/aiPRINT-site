/**
 * Credits management for aiPRINT
 */

class CreditsManager {
  constructor() {
    this.balance = 0;
    this.packages = [];
    this.anonymousGenerationsRemaining = 3;
  }

  async loadBalance() {
    if (!auth || !auth.isAuthenticated()) {
      return null;
    }

    try {
      const response = await fetch('/api/credits/balance', {
        headers: auth.getAuthHeader()
      });

      if (response.ok) {
        const data = await response.json();
        this.balance = data.balance;
        this.updateDisplay();
        return this.balance;
      }
    } catch (error) {
      console.error('Failed to load balance:', error);
    }
    return null;
  }

  async loadPackages() {
    try {
      const response = await fetch('/api/credits/packages');
      if (response.ok) {
        const data = await response.json();
        this.packages = data.packages;
        return this.packages;
      }
    } catch (error) {
      console.error('Failed to load packages:', error);
    }
    return [];
  }

  async purchaseCredits(packageId) {
    if (!auth || !auth.isAuthenticated()) {
      auth.showLoginModal();
      return;
    }

    try {
      const response = await fetch('/api/credits/purchase', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...auth.getAuthHeader()
        },
        body: JSON.stringify({ packageId })
      });

      if (!response.ok) {
        throw new Error('Failed to create checkout session');
      }

      const data = await response.json();

      // Redirect to Stripe checkout
      window.location.href = data.url;
    } catch (error) {
      console.error('Purchase error:', error);
      auth.showToast('Failed to start checkout. Please try again.', 'error');
    }
  }

  showPurchaseModal() {
    if (!auth.isAuthenticated()) {
      auth.showSignupModal();
      return;
    }

    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-[100]';
    modal.innerHTML = `
      <div class="share-modal-backdrop" onclick="this.parentElement.remove()"></div>
      <div class="share-modal" style="max-width: 600px">
        <div class="flex justify-between items-center mb-6">
          <div>
            <h3 class="text-2xl font-bold">Buy Credits</h3>
            <p class="text-sm text-gray-400 mt-1">Choose a credit package to continue creating</p>
          </div>
          <button onclick="this.closest('.fixed').remove()" class="text-gray-400 hover:text-white text-2xl">&times;</button>
        </div>

        <div id="packagesContainer" class="space-y-3">
          <div class="text-center py-8">
            <div class="spinner mx-auto"></div>
            <p class="mt-2 text-gray-400">Loading packages...</p>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Load and display packages
    this.loadPackages().then(packages => {
      const container = modal.querySelector('#packagesContainer');
      container.innerHTML = packages.map(pkg => `
        <div class="glass rounded-xl p-5 ${pkg.popular ? 'ring-2 ring-yellow-500' : ''}">
          ${pkg.popular ? '<div class="text-xs font-bold text-yellow-500 mb-2">⭐ MOST POPULAR</div>' : ''}
          <div class="flex justify-between items-start mb-3">
            <div>
              <div class="text-2xl font-bold">${pkg.credits} Credits</div>
              <div class="text-sm text-gray-400">$${pkg.pricePerCredit.toFixed(2)} per credit</div>
            </div>
            <div class="text-right">
              <div class="text-2xl font-bold">$${pkg.price.toFixed(2)}</div>
            </div>
          </div>
          <button onclick="credits.purchaseCredits('${pkg.id}')" class="btn w-full mt-2">
            Buy ${pkg.credits} credits
          </button>
        </div>
      `).join('');
    });
  }

  updateDisplay() {
    // Update credits in auth button (handled by AuthManager)
    if (auth && auth.user) {
      auth.user.credits_balance = this.balance;
      auth.updateUI();
    }
  }

  updateGenerationUI(creditsInfo) {
    if (creditsInfo.isAnonymous) {
      this.anonymousGenerationsRemaining = creditsInfo.remainingGenerations;
      this.showAnonymousLimitMessage();
    } else {
      this.balance = creditsInfo.newBalance;
      this.updateDisplay();
    }
  }

  showAnonymousLimitMessage() {
    const messageEl = document.getElementById('anonymousLimitMessage');
    if (messageEl) {
      if (this.anonymousGenerationsRemaining <= 0) {
        messageEl.innerHTML = `
          <div class="glass rounded-xl p-4 border-2 border-yellow-500/50">
            <div class="font-bold text-yellow-400 mb-2">⚠️ Daily limit reached</div>
            <p class="text-sm mb-3">You've used all 3 free generations today.</p>
            <button onclick="auth.showSignupModal()" class="btn w-full">
              Sign up for 10 free credits
            </button>
          </div>
        `;
      } else {
        messageEl.innerHTML = `
          <div class="glass rounded-xl p-3 text-sm">
            <span class="text-gray-400">Free previews remaining today:</span>
            <span class="font-bold ml-2">${this.anonymousGenerationsRemaining}/3</span>
            <button onclick="auth.showSignupModal()" class="btn-ghost ml-3 px-3 py-1 text-xs">
              Get 10 free credits →
            </button>
          </div>
        `;
      }
      messageEl.classList.remove('hidden');
    }
  }

  showInsufficientCreditsModal() {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-[100]';
    modal.innerHTML = `
      <div class="share-modal-backdrop" onclick="this.parentElement.remove()"></div>
      <div class="share-modal">
        <div class="flex justify-between items-center mb-6">
          <h3 class="text-2xl font-bold">⚡ Out of Credits</h3>
          <button onclick="this.closest('.fixed').remove()" class="text-gray-400 hover:text-white text-2xl">&times;</button>
        </div>

        <p class="mb-6 text-gray-300">You need more credits to generate images. Purchase a credit package to continue creating!</p>

        <button onclick="this.closest('.fixed').remove(); credits.showPurchaseModal()" class="btn w-full">
          Buy Credits
        </button>
      </div>
    `;

    document.body.appendChild(modal);
  }
}

// Initialize credits manager
const credits = new CreditsManager();
window.credits = credits;

// Load balance when page loads (if authenticated)
document.addEventListener('DOMContentLoaded', () => {
  if (auth && auth.isAuthenticated()) {
    credits.loadBalance();
  }
});
