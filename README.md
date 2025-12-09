# Vonage MCP HTTP Bridge

A minimal HTTP → stdio bridge that exposes the [Vonage MCP tooling server](https://www.npmjs.com/package/@vonage/vonage-mcp-server-api-bindings) over HTTP JSON‑RPC so you can use it as a Tool Provider in any AI Agent.

- Runs as a simple Node.js web service.
- Starts the Vonage MCP server via stdio.
- Implements the MCP JSON‑RPC methods n8n expects:
  - `initialize`
  - `tools/list`
  - `tools/call`
  - `notifications/initialized`
- Secured via a bearer auth token (`MCP_AUTH_TOKEN`).

---


Deploy this Bridge in one click using the following Render Blueprint


[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/ruskibenya/vonage-mcp-http-bridge)


Under "Review render.yaml configurations", select Create all as new services. Then you will need to fill in your env variables. Create a unique MCP_AUTH_TOKEN (this will be used in the MCP Client to authenticate), use a [strong password](https://namecruncher.com/password-generator) or stronger.


The MCP Bridge endpoint is:

```text
https://vonage-mcp-http-bridge.onrender.com/mcp
```


## Architecture

- **n8n MCP Client node**  
  ↕ JSON‑RPC over HTTP (`/mcp`)  
- **This bridge (Express app)**  
  ↕ stdio MCP transport  
- **Vonage MCP server** (`@vonage/vonage-mcp-server-api-bindings`)  
  ↕ Vonage APIs (Messages, Voice, Numbers, etc.)

The bridge is stateless; all Vonage logic lives in the MCP server.

---

## Prerequisites

- Node.js 20+ and npm.
- A Vonage account with:
  - API key & secret
  - An application (and private key)
  - At least one SMS / WhatsApp‑enabled number.
- n8n (Cloud or self‑hosted) with **MCP access enabled**.

---

## Environment variables

Required:

- `MCP_AUTH_TOKEN` – shared secret for bearer auth between n8n and this bridge.

Vonage:

- `VONAGE_API_KEY`
- `VONAGE_API_SECRET`
- `VONAGE_APPLICATION_ID`
- `VONAGE_PRIVATE_KEY64` – base64‑encoded contents of your private key `.key` file.
- `VONAGE_VIRTUAL_NUMBER` – SMS number in E.164 format, e.g. `+12025550123`.
- `VONAGE_WHATSAPP_NUMBER` – WhatsApp‑enabled number in E.164.

The HTTP server listens on `PORT` (injected by Render or your platform) or defaults to `3000` locally.

---

## Local development

Clone and install:

```bash
git clone [https://github.com/ruskibenya/vonage-mcp-http-bridge.git](https://github.com/ruskibenya/vonage-mcp-http-bridge.git)
cd vonage-mcp-http-bridge
npm install
```

Then run:
```bash
npm start
```

You should see:

```text
Connected to Vonage MCP tooling server via stdio  
HTTP MCP bridge listening on 3000
```

### Test with curl (JSON‑RPC)

List tools:

```bash
curl -s -X POST "http://localhost:3000/mcp" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer devtoken" \
  --data-binary '{"jsonrpc":"2.0","id":"1","method":"tools/list","params":{}}'
```

You should get a JSON‑RPC response with a `tools` array (e.g. `balance`, `whatsapp-send-text`, etc.).

Call a tool (example: `balance`):

```bash
curl -s -X POST "http://localhost:3000/mcp" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer devtoken" \
  --data-binary '{"jsonrpc":"2.0","id":"2","method":"tools/call","params":{"name":"balance","arguments":{}}}'
```

---

## Deploying to Render

This repo can be used directly on Render as a Node web service.

### Option 1: Render blueprint (one‑click deploy)

Add a `render.yaml` in the repo root:

```yaml
services:
  - type: web
    name: vonage-mcp-http-bridge
    env: node
    region: oregon
    plan: free
    buildCommand: "npm install"
    startCommand: "npm start"
    envVars:
      - key: MCP_AUTH_TOKEN
        sync: false
      - key: VONAGE_API_KEY
        sync: false
      - key: VONAGE_API_SECRET
        sync: false
      - key: VONAGE_APPLICATION_ID
        sync: false
      - key: VONAGE_PRIVATE_KEY64
        sync: false
      - key: VONAGE_VIRTUAL_NUMBER
        sync: false
      - key: VONAGE_WHATSAPP_NUMBER
        sync: false
```




## Notes / Gotchas

```text
- First cold start may be slow while the MCP server boots.
- If you see `McpError: Request timed out`, make sure the MCP server
  package is installed as a dependency and not run via npx each time.
- If n8n shows “Could not connect to your MCP server”:
  - Check MCP access toggle in n8n Settings.
  - Verify `initialize` and `tools/list` work via curl.
  - Confirm Bearer token matches MCP_AUTH_TOKEN.
```

## License

```text
MIT (or your chosen license).
```
