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

  function esc(str) {
    return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // Re-confirms the admin password before a sensitive edit is saved
  // (separate from the page-level login, per the requirement that editing
  // winner details needs its own password check).
  function confirmAdminPassword() {
    const entered = prompt('Enter the admin password to confirm this change:');
    if (entered === null) return false; // cancelled
    if (entered !== password) {
      alert('Incorrect password. Change not saved.');
      return false;
    }
    return true;
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

  let prizesCache = [];

  async function loadPrizes() {
    const prizes = await api('/prizes');
    prizesCache = prizes;
    renderPrizeTable();
  }

  function renderPrizeTable(editingId = null) {
    $('prizeTable').querySelector('tbody').innerHTML = prizesCache
      .map((p) => {
        if (p.id === editingId) {
          return `<tr data-id="${p.id}">
            <td><input class="edit-rank" type="number" min="1" value="${p.rank}" style="width:70px"></td>
            <td><input class="edit-name" type="text" value="${esc(p.name)}"></td>
            <td>
              <button class="save-prize" style="width:auto;padding:6px 10px">Save</button>
              <button class="cancel-prize" style="width:auto;padding:6px 10px;background:transparent;color:var(--muted)">Cancel</button>
            </td>
          </tr>`;
        }
        return `<tr data-id="${p.id}">
          <td>${p.rank}</td><td>${esc(p.name)}</td>
          <td>
            <button class="edit-prize" style="width:auto;padding:6px 10px;background:#334155">Edit</button>
            <button class="del-prize danger" style="width:auto;padding:6px 10px">Remove</button>
          </td>
        </tr>`;
      })
      .join('');

    document.querySelectorAll('.edit-prize').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.closest('tr').dataset.id, 10);
        renderPrizeTable(id);
      });
    });
    document.querySelectorAll('.cancel-prize').forEach((btn) => {
      btn.addEventListener('click', () => renderPrizeTable(null));
    });
    document.querySelectorAll('.save-prize').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const row = btn.closest('tr');
        const id = row.dataset.id;
        const rank = parseInt(row.querySelector('.edit-rank').value, 10);
        const name = row.querySelector('.edit-name').value.trim();
        if (!rank || !name) return;
        await api(`/prizes/${id}`, { method: 'PUT', body: JSON.stringify({ rank, name }) });
        await loadPrizes();
      });
    });
    document.querySelectorAll('.del-prize').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Remove this prize?')) return;
        await api(`/prizes/${btn.closest('tr').dataset.id}`, { method: 'DELETE' });
        await loadPrizes();
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
    const [winners, prizes] = await Promise.all([api('/winners'), api('/prizes')]);
    prizesCache = prizes;
    renderWinnerTable(winners, prizes);
    $('emailAllBtn').classList.toggle('hidden', winners.length === 0);
  }

  function renderWinnerTable(winners, prizes) {
    const prizeOptions = (selectedId) =>
      prizes.map((p) => `<option value="${p.id}" ${p.id === selectedId ? 'selected' : ''}>${p.rank}. ${esc(p.name)}</option>`).join('');

    $('winnerTable').querySelector('tbody').innerHTML = winners
      .map((w) => `
        <tr data-id="${w.id}">
          <td><select class="w-prize">${prizeOptions(w.prize_id)}</select></td>
          <td><input class="w-ticket" type="number" min="1" value="${w.ticket_number}" style="width:80px"></td>
          <td><input class="w-name" type="text" value="${esc(w.buyer_name)}"></td>
          <td><input class="w-phone" type="text" value="${esc(w.buyer_phone)}"></td>
          <td><input class="w-email" type="email" value="${esc(w.buyer_email)}"></td>
          <td>${w.notified_at ? '&#9989;' : '&mdash;'}</td>
          <td class="winner-actions">
            <button class="save-winner" style="width:auto;padding:6px 10px;background:#334155">Save</button>
            <button class="email-winner" style="width:auto;padding:6px 10px">${w.notified_at ? 'Resend' : 'Email now'}</button>
          </td>
        </tr>`)
      .join('');

    document.querySelectorAll('.save-winner').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirmAdminPassword()) return;
        const row = btn.closest('tr');
        const id = row.dataset.id;
        const body = {
          prize_id: parseInt(row.querySelector('.w-prize').value, 10),
          ticket_number: parseInt(row.querySelector('.w-ticket').value, 10),
          buyer_name: row.querySelector('.w-name').value.trim(),
          buyer_phone: row.querySelector('.w-phone').value.trim(),
          buyer_email: row.querySelector('.w-email').value.trim(),
        };
        await api(`/winners/${id}`, { method: 'PUT', body: JSON.stringify(body) });
        await loadWinners();
      });
    });

    document.querySelectorAll('.email-winner').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.closest('tr').dataset.id;
        btn.disabled = true;
        try {
          const { result } = await api(`/winners/${id}/email`, { method: 'POST' });
          if (result.skipped) alert('Not sent: ' + result.reason);
          await loadWinners();
        } catch (e) {
          alert('Failed to send: ' + e.message);
        } finally {
          btn.disabled = false;
        }
      });
    });
  }

  $('emailAllBtn').addEventListener('click', async () => {
    if (!confirm('Email every winner who hasn\u2019t been notified yet?')) return;
    $('emailAllBtn').disabled = true;
    try {
      const { results } = await api('/winners/email-all', { method: 'POST' });
      const failed = results.filter((r) => !r.ok);
      await loadWinners();
      alert(failed.length ? `Sent, but ${failed.length} failed - check email addresses.` : 'All winners emailed.');
    } catch (e) {
      alert('Failed: ' + e.message);
    } finally {
      $('emailAllBtn').disabled = false;
    }
  });

  $('drawBtn').addEventListener('click', async () => {
    if (!confirm('Run the draw now? This can only be done once.')) return;
    $('drawBtn').disabled = true;
    try {
      await api('/draw', { method: 'POST' });
      await loadWinners();
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
