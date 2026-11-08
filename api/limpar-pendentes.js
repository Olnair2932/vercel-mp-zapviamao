export default async function handler(req, res) {
  try {
    const _adm = await import('firebase-admin');
    const admin = _adm.default || _adm;
    if (!admin.apps.length) {
      admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)) });
    }
    const db = admin.firestore();
    const agora = new Date();
    const snap = await db.collection('entregas').where('expiresAt', '<', agora).get();
    let apagados = 0;
    for (const doc of snap.docs) {
      const d = doc.data();
      if (d.pago === false) {
        await doc.ref.delete();
        apagados++;
      }
    }
    return res.json({ ok: true, apagados });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message });
  }
}
