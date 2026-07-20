# Microsoft Entra (Azure AD) App Registration & Env setup

This document explains how to register apps in Microsoft Entra (Azure AD) and which environment variables to set for this project.

1) App registration (Web / SPA)
- Sign in to Azure Portal → Azure Active Directory → App registrations → New registration.
- Name: `chatbot-frontend` (or similar).
- Supported account types: choose according to your tenant (Single tenant recommended for internal apps).
- Redirect URI: Web: `https://<your-dev-host>/auth/callback` (for local dev using `http://localhost:5173` or `http://localhost:3000` use `http://localhost:5173/auth/callback` if you proxy; our backend handles callback at `http://localhost:<backendPort>/auth/callback`).
- Register.

2) Add a client secret (for backend server)
- In the App registration, go to Certificates & secrets → New client secret.
- Copy secret value now — this is the `ENTRA_CLIENT_SECRET`.

3) API permissions (Microsoft Graph)
- Backend needs to call Graph to revoke sessions (optional).
- Under API Permissions, add Application permission: `User.Read.All` or `Directory.AccessAsUser.All` depending on needs. For `revokeSignInSessions` you may need `User.ReadWrite.All` or delegated flow with admin consent — check Azure docs and grant admin consent.

4) Backend (server) app vs frontend (client)
- This project uses a server-side Authorization Code flow. Register one app for the backend (server) and configure a client secret. The backend performs token exchange and stores refresh tokens in Redis.
- Frontend only needs to redirect to the backend `/auth/authorize` endpoint; you do not need to expose client secrets in the browser.

5) Required environment variables (backend)
- `ENTRA_TENANT_ID` = your tenant id (GUID)
- `ENTRA_CLIENT_ID` = application (client) id for the backend app
- `ENTRA_CLIENT_SECRET` = client secret created above
- `ENTRA_AUTHORITY` (optional) = if you want a custom authority; otherwise `https://login.microsoftonline.com/${ENTRA_TENANT_ID}` is used.
- `ENTRA_API_SCOPE` (optional) = space-separated scopes you want to request (e.g. `api://<api-client-id>/access_as_user`), but `openid profile offline_access` are always requested.
- `SESSION_COOKIE_NAME` (optional) = defaults to `session_id`
- `REDIS_URL` = e.g. `redis://127.0.0.1:6379`

6) Required environment variables (frontend)
- `VITE_MSAL_CLIENT_ID` = optional client id if you ever use MSAL on the client. Current flow uses backend redirect; this is not required.
- `VITE_MSAL_TENANT_ID` = optional
- `VITE_MSAL_SCOPE` = optional

7) Local dev notes
- Backend callback endpoint is: `http://localhost:<backendPort>/auth/callback`
- If running frontend and backend on different hosts/ports, ensure redirect URIs added to Azure app registration and CORS is configured in backend.
- For global sign-out: the server exposes `/auth/revoke` which will attempt to call Microsoft Graph to revoke the user's sign-in sessions (requires proper Graph app permissions). It will also delete the server session cookie.

8) Production recommendations
- Use HTTPS and set `secure: true` for cookies.
- Protect client secret (do not commit to source control).
- Use least-privilege Graph permissions and grant admin consent only when necessary.
- Rotate client secrets periodically.

9) Links
- Entra app registration docs: https://learn.microsoft.com/azure/active-directory/develop/quickstart-register-app
- revokeSignInSessions Graph API: https://learn.microsoft.com/graph/api/user-revokesigninsessions
