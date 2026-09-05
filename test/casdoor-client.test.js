const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createCasdoorClient } = require('../src/main/services/casdoorClient');

// Exercise the actual OIDC library, including JWKS signatures and claim checks.
async function provider() {
  const jose = await import('jose');
  const { privateKey, publicKey } = await jose.generateKeyPair('RS256');
  const jwk = { ...await jose.exportJWK(publicKey), kid: 'test-key', use: 'sig', alg: 'RS256' };
  const settings = { issuer: 'https://casdoor.example.test', clientId: 'gitfinder',
    redirectUri: 'http://127.0.0.1:43821/oauth/callback' };
  const calls = [];
  let authorization;
  let claimsPatch = {};
  let userSubject = 'user-1';
  let invalidSignature = false;
  const mockFetch = async (input, options = {}) => {
    const url = new URL(input);
    calls.push({ url: url.href, options });
    let payload;
    if (url.pathname === '/.well-known/openid-configuration') {
      payload = {
        issuer: settings.issuer,
        authorization_endpoint: `${settings.issuer}/login/oauth/authorize`,
        token_endpoint: `${settings.issuer}/api/login/oauth/access_token`,
        userinfo_endpoint: `${settings.issuer}/api/userinfo`,
        jwks_uri: `${settings.issuer}/.well-known/jwks`,
        response_types_supported: ['code'], subject_types_supported: ['public'],
        id_token_signing_alg_values_supported: ['RS256'], code_challenge_methods_supported: ['S256'],
      };
    } else if (url.pathname === '/.well-known/jwks') {
      payload = { keys: [jwk] };
    } else if (url.pathname === '/api/userinfo') {
      assert.equal(new Headers(options.headers).get('authorization'), 'Bearer access-secret');
      payload = { sub: userSubject, name: '测试账户', email: 'should-not-be-required@example.test' };
    } else if (url.pathname === '/api/login/oauth/access_token') {
      const parameters = new URLSearchParams(options.body);
      assert.equal(parameters.has('client_secret'), false);
      assert.equal(parameters.get('client_id'), settings.clientId);
      if (parameters.get('grant_type') === 'authorization_code') {
        assert.equal(parameters.get('redirect_uri'), settings.redirectUri);
        assert.equal(crypto.createHash('sha256').update(parameters.get('code_verifier')).digest('base64url'),
          new URL(authorization.url).searchParams.get('code_challenge'));
      } else {
        assert.equal(parameters.get('grant_type'), 'refresh_token');
        assert.equal(parameters.get('refresh_token'), 'refresh-secret');
      }
      const claims = { sub: 'user-1', iss: settings.issuer, aud: settings.clientId,
        nonce: authorization.nonce, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600,
        ...claimsPatch };
      const signingKey = invalidSignature ? (await jose.generateKeyPair('RS256')).privateKey : privateKey;
      payload = { access_token: 'access-secret', refresh_token: 'refresh-secret', token_type: 'Bearer', expires_in: 3600,
        id_token: await new jose.SignJWT(claims).setProtectedHeader({ alg: 'RS256', kid: 'test-key' }).sign(signingKey) };
    } else { throw new Error(`Unexpected mock endpoint ${url.pathname}`); }
    return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const client = await createCasdoorClient(settings, new AbortController().signal, mockFetch);
  authorization = await client.authorization();
  return {
    client, authorization, calls,
    exchange: (state = authorization.state) => client.exchange(new URL(`${settings.redirectUri}?code=issued&state=${state}`), authorization),
    patch: claims => { claimsPatch = claims; },
    mismatchUser: () => { userSubject = 'other-user'; },
    badSignature: () => { invalidSignature = true; },
  };
}

test('real OIDC code and refresh flows use S256 without a secret and validate userinfo', async () => {
  const p = await provider();
  const url = new URL(p.authorization.url);
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.has('client_secret'), false);
  const session = await p.exchange();
  assert.equal(session.user.name, '测试账户');
  assert.equal(session.refreshToken, 'refresh-secret');
  assert.ok(session.expiresAt > Date.now());
  const refreshed = await p.client.refresh(session);
  assert.equal(refreshed.user.id, session.user.id);
  assert.ok(p.calls.some(call => call.url.endsWith('/.well-known/jwks')));
  assert.ok(p.calls.every(call => call.options.redirect === 'error'));
});

test('OIDC rejects forged state before sending the authorization code', async () => {
  const p = await provider();
  await assert.rejects(p.exchange('not-the-state'));
  assert.equal(p.calls.some(call => call.url.includes('/access_token')), false);
});

for (const [name, claims] of Object.entries({
  nonce: { nonce: 'wrong' }, issuer: { iss: 'https://wrong.example.test' },
  audience: { aud: 'different-client' }, expiry: { exp: 1 },
})) {
  test(`OIDC rejects invalid ${name}`, async () => {
    const p = await provider(); p.patch(claims);
    await assert.rejects(p.exchange());
  });
}

test('OIDC rejects a token signed by a key outside the issuer JWKS', async () => {
  const p = await provider(); p.badSignature();
  await assert.rejects(p.exchange());
});

test('userinfo subject must match verified ID token subject', async () => {
  const p = await provider(); p.mismatchUser();
  await assert.rejects(p.exchange());
});
