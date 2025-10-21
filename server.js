import { WebSocketServer } from "ws";
import { v4 as uuidv4 } from "uuid";

const PORT = process.env.PORT || 3000;

const EMPLOYEE_SOCK = new Map();
const VIEWERS = new Map();
const META = new Map();
const LAST_FRAME = new Map();

function send(ws, obj) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
}

const wss = new WebSocketServer({ port: PORT }, () => {
  console.log("✅ WebSocket Server Running on PORT:", PORT);
});

setInterval(() => {
  for (const ws of wss.clients) send(ws, { type: "ping" });
}, 25000);

wss.on("connection", (ws) => {
  const id = uuidv4();
  META.set(ws, { id, role: "unknown", employeeId: null });

  ws.on("message", (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === "hello") {
      const { role, employeeId } = msg;
      META.set(ws, { id, role, employeeId });

      if (role === "employee") {
        EMPLOYEE_SOCK.set(employeeId, ws);
        send(ws, { type: "ack", role, employeeId });
      }

      if (role === "viewer") {
        if (!VIEWERS.has(employeeId)) VIEWERS.set(employeeId, new Set());
        VIEWERS.get(employeeId).add(ws);
        send(ws, { type: "ack", role, employeeId });
        const last = LAST_FRAME.get(employeeId);
        if (last) send(ws, { type: "frame", employeeId, data: last });
      }
    }

    if (msg.type === "frame") {
      const { employeeId, data } = msg;
      LAST_FRAME.set(employeeId, data);
      if (VIEWERS.has(employeeId)) {
        for (const viewer of VIEWERS.get(employeeId)) {
          send(viewer, { type: "frame", employeeId, data });
        }
      }
    }
  });

  ws.on("close", () => {
    const meta = META.get(ws);
    if (!meta) return;
    const { role, employeeId } = meta;

    if (role === "employee") EMPLOYEE_SOCK.delete(employeeId);
    if (role === "viewer") {
      const set = VIEWERS.get(employeeId);
      if (set) {
        set.delete(ws);
        if (set.size === 0) VIEWERS.delete(employeeId);
      }
    }

    META.delete(ws);
  });
});
