# Security & Authentication — Device Identity, Pairing & Auth Tokens

## Authentication Flow

The Gateway supports multiple auth modes. Your UI must handle whichever is configured.

### Auth Modes

| Mode | Config | How to Authenticate |
|------|--------|-------------------|
| `none` | `gateway.auth.mode: "none"` | No auth needed (loopback only) |
| `token` | `gateway.auth.mode: "token"` | Send `auth.token` in connect params |
| `password` | `gateway.auth.mode: "password"` | Send `auth.password` in connect params |
| `device` | (default after pairing) | Device identity + signed challenge |

### Token Auth

```typescript
const connectParams = {
  // ...
  auth: {
    token: "your-gateway-token", // from ONI_GATEWAY_TOKEN env var
  },
};
```

### Password Auth

```typescript
const connectParams = {
  // ...
  auth: {
    password: "your-gateway-password",
  },
};
```

---

## Device Identity (Recommended)

Device identity provides persistent, cryptographic authentication. It uses **Ed25519 keypairs** stored in the browser's IndexedDB.

### How It Works

1. **First connection:** Generate Ed25519 keypair → store in IndexedDB
2. **Each connection:** Sign the server's `connect.challenge` nonce with private key
3. **Gateway verifies:** Checks signature against known public key
4. **Pairing:** First-time devices need approval (unless local auto-approve)
5. **Device token:** After pairing, Gateway issues a device-scoped token

### Key Generation

```typescript
// Requires secure context (HTTPS or localhost)
async function generateDeviceIdentity() {
  const keyPair = await crypto.subtle.generateKey(
    { name: "Ed25519" },  // or use @noble/ed25519 library
    true,
    ["sign", "verify"]
  );
  
  const publicKeyRaw = await crypto.subtle.exportKey("raw", keyPair.publicKey);
  const publicKeyB64 = btoa(String.fromCharCode(...new Uint8Array(publicKeyRaw)));
  
  const deviceId = await computeDeviceFingerprint(publicKeyRaw);
  
  return {
    deviceId,        // hex fingerprint of public key
    publicKey: publicKeyB64,
    privateKey: keyPair.privateKey,
  };
}
```

### Challenge Signing

```typescript
async function signChallenge(privateKey: CryptoKey, payload: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(payload);
  const signature = await crypto.subtle.sign("Ed25519", privateKey, data);
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

// The payload to sign:
function buildAuthPayload(params: {
  deviceId: string;
  clientId: string;
  clientMode: string;
  role: string;
  scopes: string[];
  signedAtMs: number;
  token: string | null;
  nonce: string;
}): string {
  return JSON.stringify({
    deviceId: params.deviceId,
    clientId: params.clientId,
    clientMode: params.clientMode,
    role: params.role,
    scopes: params.scopes,
    signedAtMs: params.signedAtMs,
    token: params.token,
    nonce: params.nonce,
  });
}
```

### Sending Device Identity in Connect

```typescript
const device = {
  id: identity.deviceId,
  publicKey: identity.publicKey,
  signature: await signChallenge(identity.privateKey, authPayload),
  signedAt: Date.now(),
  nonce: challengeNonce, // from connect.challenge event
};

const connectParams = {
  // ...
  auth: { token: storedDeviceToken ?? sharedToken },
  device,
};
```

### Storing Device Tokens

After a successful `hello-ok` with `auth.deviceToken`:

```typescript
function storeDeviceAuthToken(params: {
  deviceId: string;
  role: string;
  token: string;
  scopes: string[];
}) {
  const key = `oni-device-auth:${params.deviceId}:${params.role}`;
  localStorage.setItem(key, JSON.stringify({
    token: params.token,
    scopes: params.scopes,
    storedAt: Date.now(),
  }));
}

function loadDeviceAuthToken(params: {
  deviceId: string;
  role: string;
}): { token: string; scopes: string[] } | null {
  const key = `oni-device-auth:${params.deviceId}:${params.role}`;
  const raw = localStorage.getItem(key);
  return raw ? JSON.parse(raw) : null;
}
```

---

## Device Pairing

New devices must be approved before they can connect with full permissions.

### Pairing Flow

```
1. New device connects with device identity
2. Gateway returns error: DEVICE_PAIRING_REQUIRED
3. Device shows "waiting for approval" state
4. Operator approves via CLI: `oni devices approve <deviceId>`
   OR via another connected UI: gateway.request("devices.approve", { deviceId })
5. Device reconnects → success
```

### Managing Devices from UI

```typescript
// List all devices
const devices = await gateway.request("devices.list");
// Returns: { devices: [{ deviceId, label, role, approved, lastSeen, ... }] }

// Approve pending device
await gateway.request("devices.approve", { deviceId: "abc123" });

// Reject pending device
await gateway.request("devices.reject", { deviceId: "abc123" });

// Rotate device token (forces re-auth)
await gateway.request("device.token.rotate", { deviceId: "abc123" });

// Revoke device token (blocks until re-paired)
await gateway.request("device.token.revoke", { deviceId: "abc123" });
```

---

## Exec Approval Handling

When the agent tries to run a command that needs approval:

```typescript
// Listen for exec approval events
gateway.onEvent("exec.approval.requested", (payload) => {
  // payload: { id, command, agent, cwd, sessionKey, ... }
  showApprovalDialog(payload);
});

// Approve
await gateway.request("exec.approval.resolve", {
  id: approvalId,
  action: "approve",
});

// Reject
await gateway.request("exec.approval.resolve", {
  id: approvalId,
  action: "reject",
});
```

---

## Secure Context Requirement

Device identity requires `crypto.subtle`, which is only available in **secure contexts**:
- `https://` (any domain)
- `http://localhost` or `http://127.0.0.1`

Over plain `http://` to non-localhost, device identity is unavailable. The UI falls back to token-only auth. The Gateway may reject this unless `gateway.controlUi.allowInsecureAuth` is enabled.

---

## Connection Error Codes

| Code | Meaning | Action |
|------|---------|--------|
| `AUTH_REQUIRED` | No valid auth provided | Show login/token prompt |
| `DEVICE_PAIRING_REQUIRED` | New device needs approval | Show pairing wait screen |
| `DEVICE_AUTH_INVALID` | Device token expired/revoked | Clear stored token, reconnect |
| `PROTOCOL_MISMATCH` | Version incompatibility | Show update prompt |
| `GATEWAY_SHUTTING_DOWN` | Gateway is restarting | Auto-reconnect after delay |
