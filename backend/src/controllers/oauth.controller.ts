import { Request, Response } from "express";
import OAuthService, { OAuthError, metadata } from "../services/oauth.service";
import { AppError } from "../config/errors";

// OAuth endpoints. Token-endpoint style errors are { error, error_description }
// (RFC 6749 §5.2), not the site's { error: message }.

function noStore(res: Response) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
}

function oauthError(res: Response, err: unknown): Response {
  if (err instanceof OAuthError) {
    if (err.code === "invalid_client") res.setHeader("WWW-Authenticate", 'Basic realm="oauth"');
    return res.status(err.status).json({ error: err.code, error_description: err.description });
  }
  throw err;
}

class OAuthController {

  // GET /.well-known/oauth-authorization-server (RFC 8414)
  static metadata(_req: Request, res: Response): Response {
    res.setHeader("Cache-Control", "public, max-age=3600");
    return res.json(metadata());
  }

  // GET /api/oauth/authorize. The browser arrives here from the client
  // (claude.ai), a cross-site navigation: the SameSite=Strict session cookie
  // isn't sent, so the consent happens on our own page, /oauth/consent,
  // whose requests are same-site.
  static async authorize(req: Request, res: Response): Promise<void> {
    noStore(res);
    try {
      const id = await OAuthService.startAuthorization(req.query);
      res.redirect(302, `/oauth/consent?request=${encodeURIComponent(id)}`);
    } catch (err) {
      const e = err as { redirect?: string | false; error?: string };
      if (e && e.redirect === false) return res.redirect(302, `/oauth/consent?error=${encodeURIComponent(e.error ?? "invalid_request")}`);
      if (e && typeof e.redirect === "string") return res.redirect(302, e.redirect);
      throw err;
    }
  }

  // GET /api/oauth/requests/:id (admin): what the consent page shows, plus
  // its CSRF token
  static async getRequest(req: Request, res: Response): Promise<Response> {
    noStore(res);
    const r = await OAuthService.getRequest(req.params.id);
    if (!r) throw new AppError("NOT_FOUND", "This authorization request has expired or was already used");
    return res.json({ ...r, csrf: OAuthService.csrfToken(req.user!._id, req.cookies.jwt, r.id) });
  }

  // POST /api/oauth/requests/:id/decision (admin) { approve, csrf }
  // -> { redirect }: the page then navigates there
  static async decide(req: Request, res: Response): Promise<Response> {
    noStore(res);
    const { approve, csrf } = req.body ?? {};
    if (typeof approve !== "boolean") throw new AppError("INVALID_INPUT", "approve must be true or false");
    if (!OAuthService.checkCsrf(csrf, req.user!._id, req.cookies.jwt, req.params.id)) throw new AppError("FORBIDDEN", "Invalid CSRF token");
    try {
      return res.json({ redirect: await OAuthService.decide(req.params.id, req.user!._id, approve) });
    } catch (err) {
      if (err instanceof OAuthError) throw new AppError("NOT_FOUND", err.description);
      throw err;
    }
  }

  // POST /api/oauth/token (form-urlencoded)
  static async token(req: Request, res: Response): Promise<Response> {
    noStore(res);
    try {
      const client = await OAuthService.authenticateClient(req.headers.authorization, req.body ?? {});
      return res.json(await OAuthService.token(client, req.body ?? {}));
    } catch (err) {
      return oauthError(res, err);
    }
  }

  // POST /api/oauth/revoke (RFC 7009): always 200 for a valid client
  static async revoke(req: Request, res: Response): Promise<Response> {
    noStore(res);
    try {
      const client = await OAuthService.authenticateClient(req.headers.authorization, req.body ?? {});
      await OAuthService.revoke(client, req.body?.token);
      return res.status(200).send();
    } catch (err) {
      return oauthError(res, err);
    }
  }
}

export default OAuthController;
