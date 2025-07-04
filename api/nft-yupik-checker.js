// grecha.js
const API_PATH         = '/api/nft-yupik-checker';
const WALLET_ID        = 'feed_yupiks.near';
const SYMBOL           = 'GRECHA';
const BATCH            = 200;
const MIN_INTERVAL     = 5 * 60 * 1000;  // 5 минут
const NFT_API_BASE     = 'https://dialog-tbot.com/nft/by-owner-contract/';
const CONTRACT_ADDRESS = 'darai.mintbase1.near';

const NFT_GROUPS = [
    'common','uncommon','rare','epic','legendary',
    '4th generation','3th generation','2th generation','1th generation','0 generation'
];

let lastFetchTime = 0;

// Возвращает диапазон фильтра из полей
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

// Забираем все FT-транзакции через API-прокси
async function fetchAll() {
    const all = [];
    for (let skip = 0; ; skip += BATCH) {
        const url = `${API_PATH}`
            + `?wallet_id=${encodeURIComponent(WALLET_ID)}`
            + `&symbol=${encodeURIComponent(SYMBOL)}`
            + `&limit=${BATCH}`
            + `&skip=${skip}`;
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`API ${resp.status}`);
        const { transfers } = await resp.json();
        if (!Array.isArray(transfers) || transfers.length === 0) break;
        all.push(...transfers);
        if (transfers.length < BATCH) break;
    }
    return all;
}

// Рендерим доску и вешаем клики
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
            const txMs   = Number(tx.timestamp_nanosec) / 1e6;
            const amount = parseFloat(tx.amount) / 1000 || 0;
            if (!stats[wallet]) {
                stats[wallet] = { total: 0, firstMs: txMs };
            }
            stats[wallet].total += amount;
            if (txMs < stats[wallet].firstMs) stats[wallet].firstMs = txMs;
        });

        const sorted = Object.entries(stats)
            .map(([wallet, { total, firstMs }]) => ({ wallet, total, firstMs }))
            .sort((a, b) => a.firstMs - b.firstMs);

        if (sorted.length === 0) {
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
        <div class="col-1">${i + 1}</div>
        <div class="col-2">${item.wallet}</div>
        <div class="col-3">${item.total.toLocaleString(undefined, {
                minimumFractionDigits: 3,
                maximumFractionDigits: 3
            })}</div>`;
            row.addEventListener('click', () => toggleNFTDetails(item.wallet, row));
            container.appendChild(row);
        });
    } catch (err) {
        container.innerHTML = `<div class="error">Ошибка: ${err.message}</div>`;
        console.error(err);
    }
}

// Переключаем блок с деталями NFT
async function toggleNFTDetails(ownerId, row) {
    const next = row.nextElementSibling;
    if (next && next.classList.contains('nft-details')) {
        next.remove();
        return;
    }
    const details = document.getElementById('nft-details-template').content.cloneNode(true);
    const tbody   = details.querySelector('tbody');
    row.after(details);

    try {
        const groups = await fetchAndGroupNFTs(ownerId);
        for (const [group, count] of Object.entries(groups)) {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${group}</td><td>${count}</td>`;
            tbody.appendChild(tr);
        }
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="2">Ошибка загрузки NFT: ${err.message}</td></tr>`;
    }
}

// Прямой запрос к внешнему NFT-API и группировка по metadata.title
async function fetchAndGroupNFTs(ownerId) {
    const url = new URL(NFT_API_BASE);
    url.searchParams.set('owner_id', ownerId);
    url.searchParams.set('contract_address', CONTRACT_ADDRESS);

    const resp = await fetch(url.toString());
    if (!resp.ok) {
        throw new Error(`NFT API ${resp.status}`);
    }
    const data   = await resp.json();
    const tokens = Array.isArray(data.nfts) ? data.nfts : [];

    const counts = NFT_GROUPS.reduce((acc, g) => {
        acc[g] = 0;
        return acc;
    }, {});

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
