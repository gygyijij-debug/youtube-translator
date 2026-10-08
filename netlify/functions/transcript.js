// Netlify Function: GET /.netlify/functions/transcript?v=VIDEO_ID&lang=de
// Returns { lines: [{ s, e, t }] } with times in seconds.
exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  };
  const fail = (code, msg) => ({ statusCode: code, headers, body: JSON.stringify({ error: msg }) });

  try {
    const q = event.queryStringParameters || {};
    const v = q.v;
    const lang = (q.lang || 'de').toLowerCase();
    if (!v || !/^[\w-]{11}$/.test(v)) return fail(400, 'bad video id');

    const pr = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'com.google.android.youtube/20.10.38 (Linux; U; Android 14) gzip',
      },
      body: JSON.stringify({
        context: { client: { clientName: 'ANDROID', clientVersion: '20.10.38', hl: 'en' } },
        videoId: v,
      }),
    });
    const pj = await pr.json();
    const tracks = pj?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
    if (!tracks.length) return fail(404, 'no captions');

    const pick =
      tracks.find((t) => t.languageCode?.toLowerCase().startsWith(lang) && t.kind !== 'asr') ||
      tracks.find((t) => t.languageCode?.toLowerCase().startsWith(lang));
    if (!pick) return fail(404, 'no ' + lang + ' track');

    const url = pick.baseUrl.replace(/&fmt=[^&]*/, '') + '&fmt=json3';
    const cr = await fetch(url);
    const cj = await cr.json();

    const lines = (cj.events || [])
      .filter((e) => e.segs && e.tStartMs !== undefined)
      .map((e) => ({
        s: e.tStartMs / 1000,
        e: (e.tStartMs + (e.dDurationMs || 2000)) / 1000,
        t: e.segs.map((x) => x.utf8 || '').join('').replace(/\s+/g, ' ').trim(),
      }))
      .filter((l) => l.t);

    if (!lines.length) return fail(404, 'empty');
    return { statusCode: 200, headers, body: JSON.stringify({ lines }) };
  } catch (err) {
    return fail(500, String(err && err.message ? err.message : err));
  }
};
