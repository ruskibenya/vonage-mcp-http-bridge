import express from 'express';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const app = express();
app.use(express.json());

// Lazily-create a single MCP client connected to the Vonage tooling server
let clientPromise = null;

async function createMcpClient() {
  const command = process.env.MCP_CHILD_COMMAND || 'npx';
  const rawArgs = process.env.MCP_CHILD_ARGS || '-y,@vonage/vonage-mcp-server-api-bindings';
  const args = rawArgs
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

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

  const { method, name, arguments: toolArgs } = req.body || {};

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

      const result = await client.callTool({ name, arguments: toolArgs || {} });
      // Pass through the content from the underlying MCP server
      res.json(result);
      return;
    }

    res.status(400).json({ error: `Unsupported method: ${method}` });
  } catch (error) {
    console.error('Error handling /mcp request:', error);
    res.status(500).json({ error: 'Internal MCP bridge error', details: error.message });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`HTTP MCP bridge listening on ${port}`);
});