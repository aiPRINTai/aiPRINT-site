export default async function handler(req, res) {
  try {
    const response = await fetch("https://api.stability.ai/v2beta1/user/account", {
      headers: {
        Authorization: `Bearer ${process.env.CLIENT_KEY}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({ error: errorText });
    }

    const data = await response.json();
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}
