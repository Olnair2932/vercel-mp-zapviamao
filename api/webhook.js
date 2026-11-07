import crypto from 'node:crypto';
import { MercadoPagoConfig, Payment } from 'mercadopago';
import { registrarPagamento } from './firestore-pagamento.js';

function assinaturaValida(req, secret) {
  const signature = req.headers['x-signature'];
  const requestId = req.headers['x-request-id'];
  const queryId = req.query['data.id'];
  if (typeof signature !== 'string' || typeof requestId !== 'string' || typeof queryId !== 'string') return false;
  const parts = Object.fromEntries(signature.split(',').map(p => {
    const i = p.indexOf('=');
    return i < 0 ? ['', ''] : [p.slice(0,i).trim(), p.slice(i+1).trim()];
  }));
  const { ts, v1 } = parts;
  if (!ts || !/^[0-9]+$/.test(ts) || !/^[a-fA-F0-9]{64}$/.test(v1||'')) return false;
  const manifest = `id:${queryId.toLowerCase()};request-id:${requestId};ts:${ts};`;
  const esperado = crypto.createHmac('sha256', secret).update(manifest).digest();
  const recebido = Buffer.from(v1, 'hex');
  return crypto.timingSafeEqual(esperado, recebido);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!process.env.MP_TOKEN || !process.env.MP_WEBHOOK_SECRET) return res.status(500).end();
  if (!assinaturaValida(req, process.env.MP_WEBHOOK_SECRET)) return res.status(401).end();
  if (req.body?.type !== 'payment') return res.status(200).end();
  const bodyId = req.body?.data?.id;
  const queryId = req.query['data.id'];
  if (bodyId == null || String(bodyId).toLowerCase() !== queryId.toLowerCase()) return res.status(400).end();
  try {
    let payment=null; let lastErr=null; const tokens=[process.env.MP_TOKEN]; try{ const saW=process.env.FIREBASE_SERVICE_ACCOUNT_JSON; if(saW){ const adminW=await import('firebase-admin'); if(adminW.apps.length===0){ adminW.initializeApp({credential:adminW.credential.cert(JSON.parse(saW))}); } const dbW=adminW.firestore(); const snapF=await dbW.collection('filiais').get(); snapF.forEach(d=>{ const tt=d.data().mp_token; if(tt && tt.startsWith('APP_USR-') && tokens.includes(tt)===false) tokens.push(tt); }); } }catch(e){ console.warn('tokens filial falhou', e.message); } for(const tk of tokens){ try{ const c=new MercadoPagoConfig({accessToken:tk}); payment=await new Payment(c).get({id:String(bodyId)}); break; }catch(e){ lastErr=e; if(e && e.status && e.status===404===false && e.status===401===false) throw e; } } if(payment===null) throw lastErr;
    
    await registrarPagamento(payment);
    return res.status(200).end();
  } catch (e) {
    console.error(e);
    return res.status(500).end();
  }
}
