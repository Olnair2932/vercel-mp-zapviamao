import { MercadoPagoConfig, Preference } from 'mercadopago';
const client = new MercadoPagoConfig({ accessToken: process.env.MP_TOKEN });
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "https://central-d7800.web.app");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({erro:"Use POST"});
  try {
    const { itens, pedidoId, email } = req.body;
    const preference = new Preference(client);
    const result = await preference.create({
      body: {
        items: itens.map(i => ({
          title: String(i.nome).slice(0,60),
          quantity: Number(i.qtd || 1),
          unit_price: Number(i.preco),
          currency_id: "BRL"
        })),
        payer: { email: email || "cliente@zapviamao.com" },
        external_reference: pedidoId || Date.now().toString(),
        back_urls: {
          success: "https://central-d7800.web.app/sucesso.html",
          failure: "https://central-d7800.web.app/falha.html",
          pending: "https://central-d7800.web.app/pendente.html"
        },
        auto_return: "approved",
        statement_descriptor: "ZAP VIAMAO"
      }
    });
    return res.json({ url: result.init_point, id: result.id });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ erro: e.message });
  }
}
