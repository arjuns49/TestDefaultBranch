export default {
  async fetch(request, env) {
    const auth = request.headers.get("Authorization");
    const expected = "Basic " + btoa(":" + env.SITE_PASSWORD);

    if (auth !== expected) {
      return new Response("Password required", {
        status: 401,
        headers: { "WWW-Authenticate": 'Basic realm="Itinerary"' },
      });
    }

    return env.ASSETS.fetch(request);
  },
};
