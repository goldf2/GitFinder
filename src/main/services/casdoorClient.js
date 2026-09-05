// OIDC protocol validation belongs to openid-client, never to the renderer.
async function createCasdoorClient(settings, signal, fetchImpl = fetch) {
  const oidc = await import('openid-client');
  const config = await oidc.discovery(new URL(settings.issuer), settings.clientId,
    { token_endpoint_auth_method: 'none' }, oidc.None(), {
      execute: [oidc.enableNonRepudiationChecks],
      [oidc.customFetch]: (url, options) => fetchImpl(url, {
        ...options,
        redirect: 'error',
        signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
      }),
    });

  const sessionFromTokens = async (tokens, previous) => {
    const claims = tokens.claims();
    const subject = claims?.sub || previous?.user.id;
    if (!subject || (previous && subject !== previous.user.id)) throw new Error('OIDC_SUBJECT_MISMATCH');
    const profile = await oidc.fetchUserInfo(config, tokens.access_token, subject);
    const expiresIn = Number(tokens.expires_in);
    if (!Number.isFinite(expiresIn) || expiresIn <= 0) throw new Error('OIDC_EXPIRY_REQUIRED');
    return {
      user: {
        id: subject,
        name: String(profile.name || profile.preferred_username || subject).slice(0, 200),
        email: typeof profile.email === 'string' ? profile.email.slice(0, 254) : '',
      },
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || previous?.refreshToken || '',
      expiresAt: Math.min(Date.now() + expiresIn * 1000, claims?.exp ? claims.exp * 1000 : Infinity),
    };
  };

  return {
    async authorization() {
      const verifier = oidc.randomPKCECodeVerifier();
      const state = oidc.randomState();
      const nonce = oidc.randomNonce();
      const url = oidc.buildAuthorizationUrl(config, {
        redirect_uri: settings.redirectUri,
        scope: 'openid profile offline_access',
        code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
        code_challenge_method: 'S256', state, nonce,
        // An explicit login also lets users switch accounts after local logout.
        prompt: 'login',
      });
      if (url.protocol !== 'https:') throw new Error('OIDC_HTTPS_REQUIRED');
      return { url: url.href, state, nonce, verifier };
    },
    async exchange(url, request) {
      const tokens = await oidc.authorizationCodeGrant(config, url, {
        pkceCodeVerifier: request.verifier,
        expectedState: request.state,
        expectedNonce: request.nonce,
        idTokenExpected: true,
      });
      return sessionFromTokens(tokens);
    },
    async refresh(session) {
      if (!session.refreshToken) throw new Error('OIDC_LOGIN_REQUIRED');
      return sessionFromTokens(await oidc.refreshTokenGrant(config, session.refreshToken), session);
    },
  };
}

module.exports = { createCasdoorClient };
