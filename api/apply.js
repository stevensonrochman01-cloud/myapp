export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  try {
    const body = req.body || {};

    // Minimal server-side validation
    const required = ['role', 'name', 'whatsapp', 'country', 'dob', 'is18'];
    for (const k of required) {
      if (body[k] === undefined || body[k] === null || body[k] === '') {
        return res.status(400).send(`Missing field: ${k}`);
      }
    }

    if (body.is18 !== true ) {
      return res.status(400).send('18+ confirmation and consent are required.');
    }

    const dob = new Date(body.dob);
    if (Number.isNaN(dob.getTime())) {
      return res.status(400).send('Invalid date of birth.');
    }

    const now = new Date();
    let age = now.getFullYear() - dob.getFullYear();
    const m = now.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;

    if (age < 18) {
      return res.status(400).send('Applicant must be 18+.');
    }

    // Basic normalization
    const submission = {
      submittedAt: new Date().toISOString(),
      role: String(body.role || '').trim(),
      name: String(body.name || '').trim(),
      whatsapp: String(body.whatsapp || '').trim(),
      telegram: String(body.telegram || '').trim(),
      email: String(body.email || '').trim(),
      country: String(body.country || '').trim(),
      city: String(body.city || '').trim(),
      dob: String(body.dob || '').trim(),
      about: String(body.about || '').trim(),
      preference: String(body.preference || '').trim(),

      // helpful metadata (from Vercel)
      ip: (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim(),
      userAgent: String(req.headers['user-agent'] || '')
    };

    // 1) Always log so you can see it in Vercel logs
    console.log('GOLDEN_SUGAR_APPLICATION', JSON.stringify(submission));

    // 2) Optional: store in Vercel KV if configured
    // Create KV in Vercel, it auto-adds KV_REST_API_URL and KV_REST_API_TOKEN
    const { KV_REST_API_URL, KV_REST_API_TOKEN } = process.env;
    if (KV_REST_API_URL && KV_REST_API_TOKEN) {
      // Upstash REST: RPUSH key value
      await fetch(`${KV_REST_API_URL}/rpush/golden_sugar_applications`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}` },
        body: JSON.stringify([JSON.stringify(submission)])
      });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('apply_error', e);
    return res.status(500).send('Server error');
  }
}
