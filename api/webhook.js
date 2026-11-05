import { MercadoPagoConfig, Payment } from 'mercadopago';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });

if (!getApps().length) {
  const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');
  try {
    const { type, data } = req.body || {};
    if (type !== 'payment') return res.status(200).send('ignored');
    const payment = new Payment(client);
    const info = await payment.get({ id: data.id });
    const status = info.status;
    const codigo = info.external_reference;
    if (!codigo) return res.status(200).send('no external_reference');
    if (status === 'approved') {
      await db.collection('entregas').doc(codigo).set({
        pago: true,
        status: 'pago',
        pagamento_id: data.id,
        pagoEm: Date.now(),
        mp_status: status
      }, { merge: true });
      try {
        const snapEnt = await db.collection('entregas').doc(codigo).get();
        if (snapEnt.exists) {
          const dados = snapEnt.data();
          await db.collection('pedidos_privados').doc(codigo).set({
            id: codigo,
            filial: dados.filial || 'matriz',
            total: dados.total || 0,
            total_centavos: dados.total_centavos || 0,
            subtotal: dados.subtotal || 0,
            taxa: dados.taxa || 0,
            itens: dados.itens || [],
            cliente: dados.cliente || {},
            tipo: dados.tipo || 'entrega',
            pago: true,
            status: 'pago',
            forma_pagamento: '【entity-Mercado Pago¦canonical_name=Mercado Pago】',
            createdAt: dados.createdAt || Date.now(),
            pagoEm: Date.now(),
            pagamento_id: data.id
          }, { merge: true });
        }
      } catch (e) { console.error('Erro duplicar', e.message); }
    }
    return res.status(200).send('ok');
  } catch (e) {
    console.error(e);
    return res.status(500).send(e.message);
  }
}
