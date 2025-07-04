import fetch from 'node-fetch';

const FT_URL   = 'https://dialog-tbot.com/history/ft-transfers/';
const NFT_URL  = 'https://dialog-tbot.com/nft/by-owner-contract/';
const CONTRACT = 'darai.mintbase1.near';
const LIMIT    = 200;
const SKIP     = 0;
const GROUPS   = [
    'common','uncommon','rare','epic','legendary',
    '4th generation','3th generation','2th generation','1th generation','0 generation'
];

export default async function handler(req, res) {
    const walletId = req.query.wallet_id;
    if (!walletId) {
        return res.status(400).json({ error: 'Parameter wallet_id is required' });
    }

    // 1. Получаем все FT-трансферы
    let allTfs = [];
    let offset = Number(req.query.skip) || SKIP;
    const limit = Number(req.query.limit) || LIMIT;
    let total  = Infinity;

    do {
        const url = new URL(FT_URL);
        url.searchParams.set('wallet_id', walletId);
        url.searchParams.set('direction', 'in');
        url.searchParams.set('symbol',   req.query.symbol || 'GRECHA');
        url.searchParams.set('limit',    limit);
        url.searchParams.set('skip',     offset);
        const resp = await fetch(url);
        if (!resp.ok) break;

        const json = await resp.json();
        if (typeof json.total === 'number') total = json.total;
        const batch = Array.isArray(json.ft_transfers) ? json.ft_transfers : [];
        allTfs.push(...batch);
        offset += batch.length;
    } while (offset < total);

    // 2. Группируем суммы по отправителям
    const bySender = {};
    allTfs.forEach(tx => {
        const from   = tx.sender_id;
        const amount = parseFloat(tx.amount) || 0;
        bySender[from] = bySender[from] || { totalFt: 0, groups: [] };
        bySender[from].totalFt += amount;
    });

    // 3. Для каждого отправителя запрашиваем NFT и считаем группы
    await Promise.all(Object.keys(bySender).map(async sender => {
        // запрос NFT
        const nftUrl = new URL(NFT_URL);
        nftUrl.searchParams.set('owner_id', sender);
        nftUrl.searchParams.set('contract_address', CONTRACT);
        const resp = await fetch(nftUrl);
        let items = [];
        if (resp.ok) {
            const j = await resp.json();
            items = Array.isArray(j) ? j : (Array.isArray(j.nfts) ? j.nfts : []);
        }

        // подсчёт по ключевым словам
        const counts = GROUPS.reduce((acc, g) => { acc[g] = 0; return acc; }, {});
        items.forEach(nft => {
            const t = (nft.title || '').toLowerCase();
            const key = GROUPS.find(g => t.includes(g));
            if (key) counts[key]++;
        });

        bySender[sender].groups = Object.entries(counts)
            .filter(([, cnt]) => cnt > 0)
            .map(([name, cnt]) => ({ name, count: cnt }));
    }));

    // 4. Формируем ответ, сортируя по кошельку (или, если нужно, по totalFt)
    const leaderboard = Object.entries(bySender)
        .map(([wallet, data]) => ({ wallet, ...data }))
        .sort((a, b) => a.wallet.localeCompare(b.wallet));

    return res.status(200).json({ leaderboard });
}
