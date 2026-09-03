(() => {
  const $ = (id) => document.getElementById(id);
  let password = sessionStorage.getItem('adminPassword') || '';

  async function api(path, opts = {}) {
    const res = await fetch(`/api/admin${path}`, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Password': password,
        ...(opts.headers || {}),
      },
    });
    if (res.status === 401) throw new Error('unauthorized');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'request failed');
    return data;
  }

  async function tryEnter() {
    try {
      await api('/stats');
      sessionStorage.setItem('adminPassword', password);
      $('login').classList.add('hidden');
      $('dashboard').classList.remove('hidden');
      loadAll();
      setInterval(loadAll, 5000);
    } catch (e) {
      $('loginError').textContent = 'Incorrect password.';
    }
  }

  $('loginBtn').addEventListener('click', () => {
    password = $('password').value;
    tryEnter();
  });

  if (password) tryEnter();

  function money(minor) {
    return (minor / 100).toLocaleString(undefined, { style: 'currency', currency: 'GBP' });
  }

  async function loadStats() {
    const s = await api('/stats');
    $('ticketsSold').textContent = s.ticketsSold;
    $('ticketsRemaining').textContent = s.ticketsRemaining;
    $('revenue').textContent = money(s.revenueMinor);
    $('pending').textContent = s.pendingOrders;
    $('sellerTable').querySelector('tbody').innerHTML = s.bySeller
      .map((r) => `<tr><td>${r.seller}</td><td>${r.orders}</td><td>${r.tickets}</td><td>${money(r.revenue)}</td></tr>`)
      .join('');
  }

  async function loadOrders() {
    const orders = await api('/orders');
    $('salesTable').querySelector('tbody').innerHTML = orders
      .map((o) => {
        const time = new Date(o.paid_at + 'Z').toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
        const tickets = `#${o.ticket_start}${o.ticket_end !== o.ticket_start ? '-' + o.ticket_end : ''}`;
        return `<tr><td>${time}</td><td>${o.seller_name}</td><td>${tickets}</td><td>${o.buyer_name || '-'}</td><td>${o.buyer_phone || '-'}</td><td>${o.buyer_email || '-'}</td><td>${money(o.amount_minor)}</td></tr>`;
      })
      .join('');
  }

  async function loadPrizes() {
    const prizes = await api('/prizes');
    $('prizeTable').querySelector('tbody').innerHTML = prizes
      .map((p) => `<tr><td>${p.rank}</td><td>${p.name}</td><td><button data-id="${p.id}" class="del-prize danger" style="width:auto;padding:6px 10px">Remove</button></td></tr>`)
      .join('');
    document.querySelectorAll('.del-prize').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await api(`/prizes/${btn.dataset.id}`, { method: 'DELETE' });
        loadPrizes();
      });
    });
  }

  $('addPrizeBtn').addEventListener('click', async () => {
    const rank = parseInt($('prizeRank').value, 10);
    const name = $('prizeName').value.trim();
    if (!rank || !name) return;
    await api('/prizes', { method: 'POST', body: JSON.stringify({ rank, name }) });
    $('prizeRank').value = '';
    $('prizeName').value = '';
    loadPrizes();
  });

  async function loadWinners() {
    const winners = await api('/winners');
    $('winnerTable').querySelector('tbody').innerHTML = winners
      .map((w) => `<tr><td>${w.prize_rank}. ${w.prize_name}</td><td>#${w.ticket_number}</td><td>${w.buyer_name || '-'}</td><td>${w.buyer_email || '-'}</td><td>${w.notified_at ? '✅' : '—'}</td></tr>`)
      .join('');
  }

  $('drawBtn').addEventListener('click', async () => {
    if (!confirm('Run the draw now? This can only be done once.')) return;
    $('drawBtn').disabled = true;
    try {
      await api('/draw', { method: 'POST' });
      await loadWinners();
      alert('Draw complete. Winners have been emailed.');
    } catch (e) {
      alert('Draw failed: ' + e.message);
    } finally {
      $('drawBtn').disabled = false;
    }
  });

  function loadAll() {
    loadStats();
    loadOrders();
    loadPrizes();
    loadWinners();
  }
})();
