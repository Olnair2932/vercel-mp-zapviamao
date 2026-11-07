import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const app = getApps()[0] || initializeApp({
  credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)),
  projectId: 'central-d7800',
});
const db = getFirestore(app);

function genShortId(longId){
  try{
    const parts = String(longId).split('-');
    const last = parts[parts.length-1];
    if(last && last.length>=2 && last.length<=8) return last.toUpperCase();
  }catch(e){}
  return Math.random().toString(36).slice(2,8).toUpperCase();
}
function pedidoDocId(filial,id){ return String(filial)+'_'+String(id); }

export async function registrarPagamento(payment) {
  if (payment.status !== 'approved') return 'nao_aprovado';
  const pedidoIdLong = payment.external_reference;
  const pagamentoId = String(payment.id ?? '');
  const centavos = Math.round(payment.transaction_amount * 100);
  const pedidoRef = db.collection('entregas').doc(pedidoIdLong);
  const registroRef = db.collection('pagamentos_processados').doc(pagamentoId);

  return db.runTransaction(async tx => {
    const [pedidoSnap, registroSnap] = await Promise.all([tx.get(pedidoRef), tx.get(registroRef)]);
    if (registroSnap.exists) return 'duplicado';
    if (pedidoSnap.exists===false) return 'pedido_nao_encontrado';
    const pedido = pedidoSnap.data();
    if (pedido.total_centavos !== centavos) throw new Error('Valor diferente');
    if (pedido.pago===true) return 'ja_pago';

    const filialId = pedido.filial || 'matriz';
    const shortId = genShortId(pedidoIdLong);
    const docId = pedidoDocId(filialId, shortId);

    const ordersRef = db.collection('orders').doc(docId);
    const privadoRef = db.collection('pedidos_privados').doc(docId);

    tx.update(pedidoRef, {
      pago: true,
      pagamento_id: pagamentoId,
      valor: centavos/100,
      status: 'pago',
      status_pagamento: payment.status,
      pagoEm: Date.now()
    });
    tx.create(registroRef, { pedido_id: pedidoIdLong, pedido_curto: shortId, processado_em: FieldValue.serverTimestamp() });

    tx.set(ordersRef, {
      id: shortId,
      filial: filialId,
      items: (pedido.itens||[]).map(i=>`${i.nome||i.name||'Item'} x${i.qtd||i.quantidade||1}`).join(' | ').slice(0,500) || `Pedido MP ${shortId}`,
      itens: pedido.itens || [],
      status: 'pago',
      createdAt: pedido.createdAt || Date.now(),
      subtotal: pedido.subtotal || pedido.total || centavos/100,
      taxa: pedido.taxa || 0,
      total: pedido.total || centavos/100,
      tipo: pedido.tipo || 'entrega',
      forma_pagamento: ' Mercado Pago',
      pago: true,
      temDados: true
    }, { merge: true });

    tx.set(privadoRef, {
      id: shortId,
      filial: filialId,
      cliente: pedido.cliente || {nome:'Cliente MP'},
      endereco: pedido.endereco || '',
      referencia: pedido.referencia || '',
      pagamento: 'pix',
      createdAt: pedido.createdAt || Date.now(),
      pago: true,
      status: 'pago',
      forma_pagamento: ' Mercado Pago',
      pagamento_id: pagamentoId,
      origem_id: pedidoIdLong
    }, { merge: true });

    return 'registrado';
  });
}
