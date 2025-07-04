// api/grecha.js
// На основе оригинала :contentReference[oaicite:0]{index=0}, добавлено проксирование запроса за NFT

import fetch from 'node-fetch';

const BASE_URL = 'https://dialog-tbot.com/history/ft-transfers/';
const NFT_URL  = 'https://dialog-tbot.com/nft/by-owner-contract/';
const DEFAULT_LIMIT = 100;
const DEFAULT_SKIP  = 0;

export default async function handler(req, res) {
    const {
        wallet_id,
        symbol,
        owner_id,
        contract_address,
        limit = DEFAULT_LIMIT,
        skip  = DEFAULT_SKIP
    } = req.query;

    // 1) Если пришли параметры owner_id + contract_address — проксируем запрос за NFT
    if (owner_id && contract_address) {
        const upstreamUrl = new URL(NFT_URL);
        upstreamUrl.searchParams.set('owner_id', owner_id);
        upstreamUrl.searchParams.set('contract_address', contract_address);

        try {
            const upstream = await fetch(upstreamUrl.toString());
            if (!upstream.ok) {
                const text = await upstream.text().catch(() => '');
                return res
                    .status(upstream.status)
                    .json({ error: `Upstream ${upstream.status}: ${text}` });
            }
            const json = await upstream.json();
            return res.status(200).json(json);
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }

    // 2) Иначе — старый функционал по FT-трансферам
    if (!wallet_id || !symbol) {
        return res
            .status(400)
            .json({ error: 'Parameters not set: wallet_id & symbol, or owner_id & contract_address' });
    }

    const transfersUrl = new URL(BASE_URL);
    transfersUrl.searchParams.set('wallet_id', wallet_id);
    transfersUrl.searchParams.set('direction', 'in');
    transfersUrl.searchParams.set('symbol', symbol);
    transfersUrl.searchParams.set('limit',  Number(limit));
    transfersUrl.searchParams.set('skip',   Number(skip));

    try {
        const upstream = await fetch(transfersUrl.toString());
        if (!upstream.ok) {
            const text = await upstream.text().catch(() => '');
            return res
                .status(upstream.status)
                .json({ error: `Upstream ${upstream.status}: ${text}` });
        }
        const json = await upstream.json();
        return res.status(200).json(json);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
