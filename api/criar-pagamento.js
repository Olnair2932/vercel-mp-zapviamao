import { MercadoPagoConfig, Preference } from 'mercadopago';
const client = new MercadoPagoConfig({ accessToken: process.env.MP_TOKEN });

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "https://central-d7800.web.app");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({erro:"Use POST"});
  
  try {
    const body = req.body || {};
    const codigo = body.codigo || body.pedidoId || 'PED'+Date.now();
    const rawItens = body.itens || body.items || [];
    const email = body.email || "cliente@zapviamao.com";
    
    if(!rawItens.length){
      return res.status(400).json({erro:"Carrinho vazio", body});
    }
    
    const items = rawItens.map(i => {
      const title = String(i.nome || i.name || i.title || 'Item').slice(0,60);
      const quantity = Number(i.qtd || i.qty || i.quantity || 1);
      let unit_price = Number(i.preco || i.price || i.unit_price || 0);
      return { title, quantity, unit_price: unit_price || 0.01, currency_id: "BRL" };
    }).filter(i => i.unit_price > 0);
    
    if(!items.length){
      return res.status(400).json({erro:"Itens sem preco", rawItens});
    }
    
    if(body.taxa && Number(body.taxa) > 0){
      items.push({
        title: "Taxa de entrega",
        quantity: 1,
        unit_price: Number(body.taxa),
        currency_id: "BRL"
      });
    }
    
    const preference = new Preference(client);
    const result = await preference.create({
      body: {
        items,
        payer: { email },
        external_reference: codigo,
        back_urls: {
          success: `https://central-d7800.web.app/sucesso.html?pedido=${codigo}`,
          failure: `https://central-d7800.web.app/falha.html?pedido=${codigo}`,
          pending: `https://central-d7800.web.app/pendente.html?pedido=${codigo}`
        },
        auto_return: "approved",
        statement_descriptor: "ZAP VIAMAO"
      }
    });
    
    return res.status(200).json({ init_point: result.init_point, id: result.id, codigo });
    
  } catch(e){
    console.error('MP erro', e);
    return res.status(500).json({erro: e.message});
  }
}
