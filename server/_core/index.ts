import "dotenv/config";
import { createServer } from "http";
import { createApp } from "./app";

const port = parseInt(process.env.PORT || "3000");
createServer(createApp()).listen(port, () => {
  console.log(`[api] server listening on http://localhost:${port}`);
});
