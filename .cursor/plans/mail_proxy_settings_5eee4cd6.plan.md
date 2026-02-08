---
name: Mail Proxy Settings
overview: Add Thunderbird-style proxy configuration to the Email settings, supporting No Proxy, SOCKS4/5, and HTTP CONNECT proxy modes, integrated into IMAP and SMTP connections.
todos:
  - id: types
    content: Add proxy fields (proxyType, proxyHost, proxyPort, proxyUser, proxyPass) to TeamSettingsDoc in types.ts
    status: completed
  - id: config
    content: Add ProxyConfig interface, getProxyConfig(), getProxyUrl(), getMaskedProxyConfig(), and createProxiedSocket() helper to config.ts
    status: completed
  - id: imap
    content: Pass proxy URL to ImapFlow constructor in createImapClient()
    status: completed
  - id: smtp
    content: Add getSocket callback to nodemailer createTransport in send.ts to tunnel SMTP through proxy
    status: completed
  - id: api
    content: Add proxy fields to Zod schema and PATCH/GET handlers in email-config route
    status: completed
  - id: ui
    content: Add Mail Proxy section to Email tab in settings page with proxy type dropdown and host/port/auth fields
    status: completed
  - id: save
    content: Include proxy fields in handleSaveEmailConfig and form initialization from API response
    status: completed
isProject: false
---

# Add Proxy Configuration for Mail Connections (Thunderbird-style)

## Context

IMAP/SMTP use raw TCP sockets, not HTTP, so HTTP proxy bypass rules (`NO_PROXY`) don't apply. Thunderbird solves this by offering proxy settings that tunnel TCP connections through SOCKS or HTTP CONNECT proxies.

Fortunately, **ImapFlow already has built-in proxy support** via a `proxy` URL option (supports `http:`, `https:`, `socks:`, `socks4:`, `socks5:`), and it uses the `socks` package which is already installed. For SMTP, nodemailer exposes a `getSocket` callback that accepts a pre-connected socket, so we can use the same `socks` package to create a proxied socket.

## Architecture

The proxy settings will be **team-scoped** (stored alongside SMTP/IMAP settings in `TeamSettings`), and shared by both IMAP and SMTP connections. This matches how Thunderbird does it -- one proxy config for all mail traffic.

```mermaid
flowchart LR
  UI[Settings Page] -->|PATCH| API["/api/settings/email-config"]
  API -->|encrypt + store| FS["Firestore TeamSettings"]
  FS -->|read + decrypt| Config["getProxyConfig()"]
  Config --> IMAP["createImapClient() - uses proxy option"]
  Config --> SMTP["createTransporter() - uses getSocket with SOCKS"]
```

## Proxy Options (matching Thunderbird)

- **No Proxy** - Direct connection (current behavior)
- **SOCKS5 Proxy** - Most common for tunneling TCP traffic
- **SOCKS4 Proxy** - Legacy SOCKS support
- **HTTP CONNECT Proxy** - Tunnel through HTTP proxy using CONNECT method

Each option stores: `proxyType`, `proxyHost`, `proxyPort`, and optionally `proxyUser`/`proxyPass` (encrypted).

## Files to Change

### 1. Firestore Types - [src/lib/firebase/types.ts](src/lib/firebase/types.ts)

Add proxy fields to `TeamSettingsDoc` (after the IMAP fields, line ~93):

```typescript
// Mail Proxy (shared by IMAP & SMTP)
proxyType: "none" | "socks5" | "socks4" | "http" | null;
proxyHost: string | null;
proxyPort: number | null;
proxyUser: string | null; // Encrypted
proxyPass: string | null; // Encrypted
```

### 2. Email Config Layer - [src/lib/email/config.ts](src/lib/email/config.ts)

- Add a `ProxyConfig` interface and `getProxyConfig(teamId)` function
- Add `getMaskedProxyConfig(teamId)` for UI display
- Add `isProxyConfigured(teamId)` helper
- The `getProxyConfig` function builds a proxy URL string like `socks5://user:pass@host:port` that ImapFlow accepts directly

### 3. IMAP Connection - [src/lib/email/imap.ts](src/lib/email/imap.ts)

In `createImapClient`, add the `proxy` option to ImapFlow constructor:

```typescript
const proxyUrl = await getProxyUrl(teamId);
return new ImapFlow({
  // ...existing options...
  ...(proxyUrl ? { proxy: proxyUrl } : {}),
});
```

ImapFlow natively handles `socks5://`, `socks4://`, and `http://` proxy URLs.

### 4. SMTP Connection - [src/lib/email/send.ts](src/lib/email/send.ts)

For nodemailer, use a `getSocket` callback to tunnel through SOCKS, or use `nodemailer/lib/smtp-connection/http-proxy-client` for HTTP proxies:

```typescript
const proxyConfig = await getProxyConfig(teamId);
return nodemailer.createTransport({
  // ...existing options...
  ...(proxyConfig
    ? {
        getSocket: async (_options, callback) => {
          try {
            const socket = await createProxiedSocket(proxyConfig, host, port);
            callback(null, { connection: socket });
          } catch (err) {
            callback(err);
          }
        },
      }
    : {}),
});
```

Create a shared `createProxiedSocket` helper in a new utility or in `config.ts`.

### 5. API Route - [src/app/api/settings/email-config/route.ts](src/app/api/settings/email-config/route.ts)

- Add proxy fields to the Zod validation schema
- Handle proxy fields in the PATCH handler (encrypt user/pass)
- Return masked proxy config in GET response

### 6. Settings UI - [src/app/(dashboard)/settings/page.tsx](<src/app/(dashboard)/settings/page.tsx>)

Add a "Mail Proxy" section in the Email tab, placed above the IMAP/SMTP sections (since the proxy applies to both). The UI will include:

- **Proxy Type** dropdown: No Proxy / SOCKS5 / SOCKS4 / HTTP CONNECT
- **Proxy Host** and **Proxy Port** fields (shown when type is not "none")
- **Proxy Username** and **Proxy Password** fields (optional, shown when type is not "none")
- Fields disabled/hidden when "No Proxy" is selected

Add `proxyForm` state alongside `smtpForm` and `imapForm`, and include proxy fields in `handleSaveEmailConfig` payload.

### 7. Verify Functions

Update `verifyImapConnection` and `verifySmtpConnection` in their respective files to use the proxy when configured -- they already call `createImapClient`/`createTransporter`, so this should work automatically once those functions are updated.
