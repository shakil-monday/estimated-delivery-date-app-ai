// Health check for the hosting platform (Railway).
export const loader = () => new Response("ok", { headers: { "Content-Type": "text/plain" } });
