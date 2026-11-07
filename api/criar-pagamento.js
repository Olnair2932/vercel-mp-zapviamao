export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');
  if(req.method==='OPTIONS') return res.status(200).end();
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
  try{
    const {codigo,filial} = req.body||{}; let itens=[]; let taxa=0; let total_centavos=0;
    const tokenEnv = process.env.MP_TOKEN;
    if(!codigo) return res.status(400).json({error:"codigo obrigatorio"});
    let token = tokenEnv;
    try{
      const sa = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
      if(sa && filial && filial!=='matriz'){
        const admin = await import('firebase-admin');
        if(!admin.apps.length){
          const cred = JSON.parse(sa);
          admin.initializeApp({credential: admin.credential.cert(cred)});
        }
        const db = admin.firestore();
        const doc = await db.collection('filiais').doc(filial).get();
        if(doc.exists){
          const data = doc.data();
          if(data.mp_token && data.mp_token.startsWith('APP_USR-')) token = data.mp_token;
        }
      }
    }catch(e){ console.warn('Usando token dono:', e.message); }
    if(!token) return res.status(500).json({error:'MP_TOKEN não configurado'});
        try{ const sa2=process.env.FIREBASE_SERVICE_ACCOUNT_JSON; if(sa2){ const admin2=await import('firebase-admin'); if(admin2.apps.length===0){ admin2.initializeApp({credential:admin2.credential.cert(JSON.parse(sa2))}); } const db2=admin2.firestore(); const snap=await db2.collection('entregas').doc(codigo).get(); if(snap.exists===false) return res.status(404).json({error:'Pedido nao encontrado'}); const ped=snap.data(); if(ped.pago===true) return res.status(409).json({error:'Pedido ja pago'}); if(ped.total_centavos==null) return res.status(500).json({error:'Pedido sem total'}); total_centavos=ped.total_centavos; itens=ped.itens||[]; taxa=ped.taxa||0; } else { return res.status(500).json({error:'Sem acesso ao Firestore'}); } }catch(e){ console.error(e); return res.status(500).json({error:'Erro ao validar pedido'}); }
    const r = await fetch('https://api.mercadopago.com/checkout/preferences',{
      method:'POST',
      headers:{'Authorization':'Bearer '+token,'Content-Type':'application/json'},
      body: JSON.stringify({
        external_reference: codigo,
        metadata:{codigo_pedido:codigo, filial:filial||'matriz'},
        items:(itens||[]).map(it=>({
          title:(it.nome||it.name||'Item').slice(0,120),
          quantity:Number(it.qtd||it.quantity||1),
          unit_price:Number(it.preco||it.price||0),
          currency_id:'BRL'
        })).concat(taxa>0?[{title:'Taxa de entrega',quantity:1,unit_price:Number(taxa),currency_id:'BRL'}]:[]),
        back_urls:{
          success:`https://central-d7800.web.app/sucesso.html?pedido=${codigo}&filial=${filial||'matriz'}`,
          failure:`https://central-d7800.web.app/falha.html?pedido=${codigo}&filial=${filial||'matriz'}`,
          pending:`https://central-d7800.web.app/pendente.html?pedido=${codigo}&filial=${filial||'matriz'}`
        },
        payment_methods: {
          excluded_payment_types: [
            { id: "ticket" }
          ],
          installments: 12
        },
        auto_return:'approved',
        notification_url:'https://vercel-mp-zapviamao.vercel.app/api/webhook'
      })
    });
    const data = await r.json();
    if(!r.ok) return res.status(r.status).json({error:'MP erro', details:data, filial});
    return res.status(200).json({init_point:data.init_point, id:data.id, codigo, filial: filial||'matriz', proprio: token!==tokenEnv});
  }catch(e){ console.error(e); return res.status(500).json({error:'Erro interno', details:e.message}); }
}
