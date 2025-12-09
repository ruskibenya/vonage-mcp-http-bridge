import express from 'express';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const app = express();
app.use(express.json());

// Lazily-create a single MCP client connected to the Vonage tooling server
let clientPromise = null;

async function createMcpClient() {
  const command = 'node_modules/.bin/vonage-mcp-server-api-bindings';
  const args = [];

  const transport = new StdioClientTransport({
    command,
    args,
    env: {
      ...process.env,
    },
  });

  const client = new Client(
    { name: 'vonage-http-bridge', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );

  await client.connect(transport);
  console.log('Connected to Vonage MCP tooling server via stdio');
  return client;
}

function getMcpClient() {
  if (!clientPromise) {
    clientPromise = createMcpClient().catch((err) => {
      console.error('Failed to start MCP client:', err);
      clientPromise = null;
      throw err;
    });
  }
  return clientPromise;
}

function checkAuth(req, res) {
  const requiredToken = process.env.MCP_AUTH_TOKEN;
  if (!requiredToken) {
    // If no token is configured, accept all requests (useful for local testing)
    return true;
  }

  const header = req.headers['authorization'] || '';
  const token = header.toString().startsWith('Bearer ')
    ? header.toString().slice('Bearer '.length).trim()
    : '';

  if (token !== requiredToken) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

app.post('/mcp', async (req, res) => {
  if (!checkAuth(req, res)) return;

  const body = req.body || {};

  // --- Branch 1: JSON-RPC mode (used by n8n MCP Client) ---
  if (body.jsonrpc === '2.0' && typeof body.method === 'string') {
    const { id, method, params } = body;

    try {
      const client = await getMcpClient();

      // n8n sends this after connecting; just acknowledge
      if (method === 'notifications/initialized') {
        res.status(200).end();
        return;
      }

      if (method === 'tools/list') {
        const toolsResponse = await client.listTools();
        res.json({
          jsonrpc: '2.0',
          id,
          result: { tools: toolsResponse.tools || [] },
        });
        return;
      }

      if (method === 'tools/call') {
        const { name, arguments: toolArgs } = params || {};
        if (!name) {
          res.status(400).json({
            jsonrpc: '2.0',
            id,
            error: { code: -32602, message: 'Missing tool name in params' },
          });
          return;
        }

        const result = await client.callTool({
          name,
          arguments: toolArgs || {},
        });

        res.json({
          jsonrpc: '2.0',
          id,
          result,
        });
        return;
      }

      // Unknown JSON-RPC method
      res.status(400).json({
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: `Unsupported method: ${method}` },
      });
      return;
    } catch (error) {
      console.error('Error handling JSON-RPC /mcp request:', error);
      res.status(500).json({
        jsonrpc: '2.0',
        id: body.id ?? null,
        error: {
          code: -32603,
          message: 'Internal MCP bridge error',
          data: error.message,
        },
      });
      return;
    }
  }

  // --- Branch 2: Simple mode (manual curl: { "method": "list_tools" }) ---
  const { method, name, arguments: toolArgs } = body;

  if (!method) {
    res.status(400).json({ error: 'Missing method field in request body' });
    return;
  }

  try {
    const client = await getMcpClient();

    if (method === 'list_tools') {
      const toolsResponse = await client.listTools();
      res.json({ tools: toolsResponse.tools || [] });
      return;
    }

    if (method === 'call_tool') {
      if (!name) {
        res.status(400).json({ error: 'Missing tool name for call_tool' });
        return;
      }

      const result = await client.callTool({
        name,
        arguments: toolArgs || {},
      });
      res.json(result);
      return;
    }

    res.status(400).json({ error: `Unsupported method: ${method}` });
  } catch (error) {
    console.error('Error handling simple /mcp request:', error);
    res.status(500).json({
      error: 'Internal MCP bridge error',
      details: error.message,
    });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`HTTP MCP bridge listening on ${port}`);
});