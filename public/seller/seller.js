(() => {
  const $ = (id) => document.getElementById(id);

  const screens = {
    setup: $('setup'),
    sell: $('sell'),
    qr: $('qr'),
    result: $('result'),
  };
  function show(screen) {
    Object.values(screens).forEach((s) => s.classList.add('hidden'));
    screens[screen].classList.remove('hidden');
  }

  // --- seller identity, persisted per-device ---
  let sellerId = localStorage.getItem('sellerId');
  let sellerName = localStorage.getItem('sellerName');
  if (!sellerId) {
    sellerId = 'seller_' + Math.random().toString(36).slice(2, 10);
    localStorage.setItem('sellerId', sellerId);
  }

  if (sellerName) {
    $('sellerName').value = sellerName;
    enterSellScreen();
  }

  $('startBtn').addEventListener('click', () => {
    const name = $('sellerName').value.trim();
    if (!name) return;
    sellerName = name;
    localStorage.setItem('sellerName', name);
    enterSellScreen();
  });

  function enterSellScreen() {
    $('sellerLabel').textContent = sellerName;
    show('sell');
    refreshRemaining();
  }

  // --- change seller (tap the name top-left) ---
  $('sellerLabel').addEventListener('click', () => {
    $('sellerModalInput').value = sellerName;
    $('sellerModal').classList.remove('hidden');
    setTimeout(() => $('sellerModalInput').focus(), 50);
  });
  $('sellerModalCancel').addEventListener('click', () => {
    $('sellerModal').classList.add('hidden');
  });
  $('sellerModalSave').addEventListener('click', () => {
    const newName = $('sellerModalInput').value.trim();
    if (!newName) return;
    if (newName !== sellerName) {
      // Treat this as a different person selling on this phone: give them
      // their own seller ID so admin stats attribute sales correctly.
      sellerId = 'seller_' + Math.random().toString(36).slice(2, 10);
      sellerName = newName;
      localStorage.setItem('sellerId', sellerId);
      localStorage.setItem('sellerName', sellerName);
      $('sellerLabel').textContent = sellerName;
    }
    $('sellerModal').classList.add('hidden');
  });

  // --- quantity picker ---
  let qty = 5;
  const TICKET_PRICE = window.__TICKET_PRICE_MINOR__ || null; // set below via fetch
  function renderQty() {
    $('qtyValue').textContent = qty;
  }
  $('qtyMinus').addEventListener('click', () => { if (qty > 1) qty--; renderQty(); });
  $('qtyPlus').addEventListener('click', () => { if (qty < 500) qty++; renderQty(); });
  document.querySelectorAll('.qty-bulk-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const delta = parseInt(btn.dataset.delta, 10);
      qty = Math.min(500, Math.max(1, qty + delta));
      renderQty();
    });
  });
  renderQty();

  async function refreshRemaining() {
    try {
      const r = await fetch('/api/orders/meta/remaining').then((r) => r.json());
      $('remaining').textContent = `${r.remaining} left`;
    } catch (e) { /* non-fatal */ }
  }

  // --- selling ---
  let pollTimer = null;
  let countdownTimer = null;

  $('sellBtn').addEventListener('click', async () => {
    $('sellBtn').disabled = true;
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sellerId, sellerName, quantity: qty }),
      });
      const order = await res.json();
      if (!res.ok) throw new Error(order.error || 'Could not start sale');

      $('qrImage').src = order.qrDataUrl;
      $('qrSummary').textContent =
        `${order.quantity} ticket${order.quantity > 1 ? 's' : ''} · #${order.ticketStart}` +
        (order.ticketEnd !== order.ticketStart ? `-${order.ticketEnd}` : '') +
        ` · ${formatMoney(order.amountMinor)}`;
      setStatus('pending', 'Waiting for payment…');
      show('qr');
      startCountdown(order.ttlSeconds);
      startPolling(order.orderId);
    } catch (err) {
      alert(err.message);
    } finally {
      $('sellBtn').disabled = false;
    }
  });

  function startCountdown(seconds) {
    let remaining = seconds;
    clearInterval(countdownTimer);
    updateTimerDisplay(remaining);
    countdownTimer = setInterval(() => {
      remaining--;
      updateTimerDisplay(remaining);
      if (remaining <= 0) clearInterval(countdownTimer);
    }, 1000);
  }
  function updateTimerDisplay(seconds) {
    const s = Math.max(0, seconds);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    $('qrTimer').textContent = `${m}:${String(sec).padStart(2, '0')}`;
  }

  function startPolling(orderId) {
    clearInterval(pollTimer);
    pollTimer = setInterval(async () => {
      try {
        const order = await fetch(`/api/orders/${orderId}`).then((r) => r.json());
        if (order.status === 'paid') {
          clearInterval(pollTimer);
          clearInterval(countdownTimer);
          showResult(true, order);
        } else if (order.status === 'expired') {
          clearInterval(pollTimer);
          clearInterval(countdownTimer);
          showResult(false, order);
        }
      } catch (e) { /* keep trying */ }
    }, 2000);
  }

  function setStatus(kind, text) {
    const el = $('qrStatus');
    el.className = `status ${kind}`;
    el.textContent = text;
  }

  $('cancelBtn').addEventListener('click', () => {
    clearInterval(pollTimer);
    clearInterval(countdownTimer);
    // The order will simply expire server-side at the 5 minute mark and
    // release naturally; we just stop watching it on this screen.
    show('sell');
    refreshRemaining();
  });

  function showResult(paid, order) {
    if (paid) {
      $('resultIcon').textContent = '✅';
      $('resultTitle').textContent = 'Payment received';
      $('resultDetail').textContent =
        `${order.quantity} ticket${order.quantity > 1 ? 's' : ''} (#${order.ticket_start}` +
        (order.ticket_end !== order.ticket_start ? `-${order.ticket_end}` : '') +
        `) sold to ${order.buyer_name || order.buyer_email || 'buyer'}.`;
      addRecentSale(order);
    } else {
      $('resultIcon').textContent = '⌛';
      $('resultTitle').textContent = 'QR code expired';
      $('resultDetail').textContent = 'The buyer didn\u2019t complete payment in time. Start a new sale.';
    }
    show('result');
  }

  $('newSaleBtn').addEventListener('click', () => {
    qty = 5; renderQty();
    show('sell');
    refreshRemaining();
  });

  const recent = [];
  function addRecentSale(order) {
    recent.unshift(order);
    if (recent.length > 5) recent.pop();
    $('recentSales').innerHTML = recent
      .map((o) => `<div class="row"><span>#${o.ticket_start}${o.ticket_end !== o.ticket_start ? '-' + o.ticket_end : ''}</span><span>${formatMoney(o.amount_minor)}</span></div>`)
      .join('');
  }

  function formatMoney(minor) {
    return (minor / 100).toLocaleString(undefined, { style: 'currency', currency: 'GBP' });
  }

  refreshRemaining();
  setInterval(refreshRemaining, 15000);

  // register service worker for installability (best-effort)
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/seller/sw.js').catch(() => {});
  }
})();
