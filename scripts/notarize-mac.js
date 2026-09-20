const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

// Runs before builder archives the final app, keeping generated hashes authoritative.
module.exports = async function notarizeMac(context) {
  if (context.electronPlatformName !== 'darwin' || process.env.GITFINDER_RELEASE_MODE !== 'official') return;
  const profile = process.env.GITFINDER_NOTARY_KEYCHAIN_PROFILE;
  if (!profile) throw new Error('Missing notarization keychain profile');
  const appPath = path.join(context.appOutDir, context.packager.appInfo.productFilename + '.app');
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'gitfinder-notarize-'));
  try {
    const archive = path.join(temporary, 'application.zip');
    execFileSync('ditto', ['-c', '-k', '--keepParent', appPath, archive]);
    execFileSync('xcrun', ['notarytool', 'submit', archive, '--keychain-profile', profile, '--wait'], { stdio: 'inherit' });
    execFileSync('xcrun', ['stapler', 'staple', appPath], { stdio: 'inherit' });
    execFileSync('xcrun', ['stapler', 'validate', appPath], { stdio: 'inherit' });
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
};
