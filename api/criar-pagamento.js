export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');
  if(req.method==='OPTIONS') return res.status(200).end();
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
  try{
    const {codigo,total_centavos,itens,taxa,filial} = req.body||{};
    const tokenEnv = process.env.MP_TOKEN;
    if(!codigo || !total_centavos) return res.status(400).json({error:'codigo e total_centavos obrigatórios'});
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
        auto_return:'approved',
        notification_url:'https://vercel-mp-zapviamao.vercel.app/api/webhook'
      })
    });
    const data = await r.json();
    if(!r.ok) return res.status(r.status).json({error:'MP erro', details:data, filial});
    return res.status(200).json({init_point:data.init_point, id:data.id, codigo, filial: filial||'matriz', proprio: token!==tokenEnv});
  }catch(e){ console.error(e); return res.status(500).json({error:'Erro interno', details:e.message}); }
}
