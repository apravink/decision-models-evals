import { createServer } from "node:http";

const PORT = Number(process.env.PORT ?? 8788);

function hash(s: string): number {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

const server = createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/v1/models") {
    send(res, 200, { models: [{ name: "jev-latest", description: "mock", release_date: "2026-01-01" }] });
    return;
  }
  if (req.method === "POST" && req.url === "/v1/systemone") {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
      model?: string;
      questions?: Record<string, { type?: string }>;
    };
    const answers: Record<string, unknown> = {};
    for (const [id, question] of Object.entries(body.questions ?? {})) {
      if (question?.type === "noul") {
        answers[id] = { type: "noul", noul: 0.05 + (hash(id) % 90) / 100 };
      } else {
        answers[id] = { type: "noul", noul: 0.5 };
      }
    }
    send(res, 200, {
      model: body.model ?? "jev-mock",
      answers,
      usage: { input_tokens: 100, output_tokens: 10 },
    });
    return;
  }
  send(res, 404, { error: "not found" });
});

function send(res: import("node:http").ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(body) });
  res.end(body);
}

server.listen(PORT, () => console.log(`mock-jev listening on http://localhost:${PORT}`));
