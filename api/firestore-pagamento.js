import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
const app = getApps()[0] || initializeApp({
  credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)),
  projectId: 'central-d7800',
});
const db = getFirestore(app);
export async function registrarPagamento(payment) {
  if (payment.status !== 'approved') return 'nao_aprovado';
  const pedidoId = payment.external_reference;
  const pagamentoId = String(payment.id ?? '');
  const centavos = Math.round(payment.transaction_amount * 100);
  const pedidoRef = db.collection('entregas').doc(pedidoId);
  const registroRef = db.collection('pagamentos_processados').doc(pagamentoId);
  return db.runTransaction(async tx => {
    const [pedidoSnap, registroSnap] = await Promise.all([tx.get(pedidoRef), tx.get(registroRef)]);
    if (registroSnap.exists) return 'duplicado';
    if (!pedidoSnap.exists) throw new Error('Pedido não encontrado');
    const pedido = pedidoSnap.data();
    if (pedido.total_centavos !== centavos) throw new Error('Valor diferente');
    if (pedido.pago === true) throw new Error('Pedido já pago');
    tx.update(pedidoRef, { pago: true, pagamento_id: pagamentoId, valor: centavos/100, status_pagamento: payment.status });
    tx.create(registroRef, { pedido_id: pedidoId, processado_em: FieldValue.serverTimestamp() });
    return 'registrado';
  });
}
