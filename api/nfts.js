// pages/api/nfts.js
import fetch from 'node-fetch';

export default async function handler(req, res) {
    const { owner_id, contract_address } = req.query;
    if (!owner_id || !contract_address) {
        return res.status(400).json({ error: 'Required: owner_id & contract_address' });
    }

    const upstream = new URL('https://dialog-tbot.com/nft/by-owner-contract/');
    upstream.searchParams.set('owner_id', owner_id);
    upstream.searchParams.set('contract_address', contract_address);

    try {
        const resp = await fetch(upstream.toString());
        if (!resp.ok) {
            const text = await resp.text().catch(() => '');
            return res.status(resp.status).json({ error: `Upstream ${resp.status}: ${text}` });
        }
        const json = await resp.json();
        return res.status(200).json(json);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
