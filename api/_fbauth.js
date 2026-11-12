// Adds the Firebase database secret to every server-side request to Realtime Database.
// Required once the security rules (database.rules.json) are switched on: the server keeps
// full access, while browsers lose access to account records, billing and backups.
// Set FIREBASE_DB_SECRET in Vercel (Firebase console → Project settings → Service accounts → Database secrets).
if (!global.__qcFbAuth) {
  global.__qcFbAuth = true;
  const _f = global.fetch;
  global.fetch = function (url, opt) {
    try {
      const secret = process.env.FIREBASE_DB_SECRET;
      if (secret && typeof url === 'string' && /^https:\/\/[a-z0-9.-]+\.(firebaseio\.com|firebasedatabase\.app)\//i.test(url) && !/[?&]auth=/.test(url)) {
        url += (url.includes('?') ? '&' : '?') + 'auth=' + encodeURIComponent(secret);
      }
    } catch (e) { /* ignore */ }
    return _f.call(this, url, opt);
  };
}
