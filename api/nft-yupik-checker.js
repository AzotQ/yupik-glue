/* grecha.js (клиент) */

// Константы API
const API_PATH           = '/api/nft-yupik-checker';
const NFT_PROXY_PATH     = '/api/nfts';
const WALLET_ID          = 'feed_yupiks.near';
const SYMBOL             = 'GRECHA';
const BATCH              = 200;
const MIN_INTERVAL       = 5 * 60 * 1000;  // 5 минут
const CONTRACT_ADDRESS   = 'darai.mintbase1.near';

// Группы по ключевым словам в title
const NFT_GROUPS = [
    'common','uncommon','rare','epic','legendary',
    '4th generation','3th generation','2th generation','1th generation','0 generation'
];

let lastFetchTime = 0;

function getFilterRange() {
    const sinceStr = document.getElementById('since-input').value;
    const untilStr = document.getElementById('until-input').value;
    return {
        sinceStr,
        untilStr,
        sinceMs: new Date(sinceStr).getTime(),
        untilMs: new Date(untilStr).getTime()
    };
}

async function fetchAll() {
    let all = [];
    for (let skip = 0; ; skip += BATCH) {
        const url = `${API_PATH}`
            + `?wallet_id=${encodeURIComponent(WALLET_ID)}`
            + `&symbol=${encodeURIComponent(SYMBOL)}`
            + `&limit=${BATCH}`
            + `&skip=${skip}`;
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`API ${resp.status}`);
        const { transfers } = await resp.json();
        if (!Array.isArray(transfers) || !transfers.length) break;
        all.push(...transfers);
        if (transfers.length < BATCH) break;
    }
    return all;
}

async function renderBoard() {
    const now = Date.now();
    if (now - lastFetchTime < MIN_INTERVAL) return;
    lastFetchTime = now;

    const { sinceStr, untilStr, sinceMs, untilMs } = getFilterRange();
    const container = document.getElementById('items');
    container.innerHTML = '';

    try {
        let data = await fetchAll();
        data = data.filter(tx => {
            const txMs = Number(tx.timestamp_nanosec) / 1e6;
            return txMs >= sinceMs && txMs <= untilMs;
        });

        const stats = {};
        data.forEach(tx => {
            const wallet = tx.from;
            const txMs = Number(tx.timestamp_nanosec) / 1e6;
            const amount = parseFloat(tx.amount) / 1000 || 0;
            if (!stats[wallet]) stats[wallet] = { total: 0, firstMs: txMs };
            stats[wallet].total += amount;
            if (txMs < stats[wallet].firstMs) stats[wallet].firstMs = txMs;
        });

        const sorted = Object.entries(stats)
            .map(([w, { total, firstMs }]) => ({ wallet: w, total, firstMs }))
            .sort((a, b) => a.firstMs - b.firstMs);

        if (!sorted.length) {
            container.innerHTML = `
        <div class="error">
          Нет переводов в период<br>
          ${sinceStr.replace('T',' ')} — ${untilStr.replace('T',' ')}
        </div>`;
            return;
        }

        sorted.forEach((item, i) => {
            const row = document.createElement('div');
            row.className = 'leaderboard-item';
            row.innerHTML = `
        <div class="col-1">${i+1}</div>
        <div class="col-2">${item.wallet}</div>
        <div class="col-3">${item.total.toLocaleString(undefined, { minimumFractionDigits:3, maximumFractionDigits:3 })}</div>`;
            row.addEventListener('click', () => toggleNFTDetails(item.wallet, row));
            container.appendChild(row);
        });
    } catch (err) {
        container.innerHTML = `<div class="error">Ошибка: ${err.message}</div>`;
        console.error(err);
    }
}

async function toggleNFTDetails(wallet, row) {
    const next = row.nextElementSibling;
    if (next && next.classList.contains('nft-details')) {
        next.remove();
        return;
    }
    const tmpl = document.getElementById('nft-details-template').content.cloneNode(true);
    const tbody = tmpl.querySelector('tbody');
    row.after(tmpl);
    try {
        const groups = await fetchAndGroupNFTs(wallet);
        for (const [group, count] of Object.entries(groups)) {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${group}</td><td>${count}</td>`;
            tbody.appendChild(tr);
        }
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="2">Ошибка загрузки NFT: ${err.message}</td></tr>`;
    }
}

async function fetchAndGroupNFTs(ownerId) {
    // Вызываем внутренний Proxy API вместо прямого обращения к внешнему
    const proxyUrl = `${NFT_PROXY_PATH}`
        + `?owner_id=${encodeURIComponent(ownerId)}`
        + `&contract_address=${encodeURIComponent(CONTRACT_ADDRESS)}`;
    const resp = await fetch(proxyUrl);
    if (!resp.ok) throw new Error(`Proxy API ${resp.status}`);
    const data = await resp.json();
    const tokens = Array.isArray(data.nfts) ? data.nfts : [];

    const counts = NFT_GROUPS.reduce((acc, g) => { acc[g] = 0; return acc; }, {});
    tokens.forEach(token => {
        const title = (token.metadata?.title || '').toLowerCase();
        for (const group of NFT_GROUPS) {
            if (title.includes(group.toLowerCase())) {
                counts[group]++;
                break;
            }
        }
    });
    return counts;
}

document.getElementById('apply-filter').addEventListener('click', renderBoard);
window.addEventListener('DOMContentLoaded', renderBoard);
