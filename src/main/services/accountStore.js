const fs = require('node:fs');
const path = require('node:path');
const { writeJsonAtomic } = require('./providerUtils');

// This file is deliberately outside config.json and its renderer-facing APIs.
function createAccountStore(directory, safeStorage) {
  const file = path.join(directory, 'account-session.json');
  const canEncrypt = () => safeStorage.isEncryptionAvailable()
    && safeStorage.getSelectedStorageBackend?.() !== 'basic_text';
  return {
    read() {
      if (!fs.existsSync(file)) return {};
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      let session = null;
      if (data.encryptedSession && canEncrypt()) {
        try {
          const decrypted = JSON.parse(safeStorage.decryptString(Buffer.from(data.encryptedSession, 'base64')));
          if (decrypted.configuration?.issuer === data.configuration?.issuer
            && decrypted.configuration?.clientId === data.configuration?.clientId) session = decrypted.session;
        } catch (_) { /* A lost OS key requires signing in again, not a startup failure. */ }
      }
      return { configuration: data.configuration, session };
    },
    write(configuration, session) {
      let encryptedSession = null;
      if (session && canEncrypt()) {
        try { encryptedSession = safeStorage.encryptString(JSON.stringify({ configuration, session })).toString('base64'); }
        catch (_) { /* No plaintext fallback. The current session remains in memory only. */ }
      }
      writeJsonAtomic(file, { configuration, encryptedSession });
      return Boolean(encryptedSession);
    },
  };
}

module.exports = { createAccountStore };
