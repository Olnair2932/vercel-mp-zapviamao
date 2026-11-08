export default async function handler(req, res) {
  const _adm = await import('firebase-admin');
  const admin = _adm.default || _adm;
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
  }
  const db = admin.firestore();
  const agora = new Date();
  const snap = await db.collection('entregas').where('pago', '==', false).where('expiresAt', '<', agora).get();
  let apagados = 0;
  for (const doc of snap.docs) {
    await doc.ref.delete();
    apagados++;
  }
  return res.json({ ok: true, apagados });
}
