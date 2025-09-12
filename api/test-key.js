// api/test-key.js
module.exports = async (req, res) => {
  const key = process.env.CLIENT_KEY_; // the env var you set in Vercel
  if (!key) {
    return res.status(500).json({ ok: false, error: 'Missing env CLIENT_KEY_' });
  }
  return res.status(200).json({
    ok: true,
    hasKey: key.startsWith('sk-'),
    last4: key.slice(-4),
  });
};
