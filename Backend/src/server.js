import dotenv from "dotenv";
import { app } from "./app.js";
import { connectMongo } from "./db/mongo.js";

dotenv.config();

/**
 * Disable SSL validation ONLY in development
 */
if (process.env.NODE_ENV !== "production") {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "0.0.0.0";

async function start() {
  await connectMongo();

  app.listen(port, host, () => {
    console.log("======================================");
    console.log("🚀 SAP CHAT BACKEND STARTED");
    console.log(`🌐 URL: http://localhost:${port}`);
    console.log(
      process.env.NODE_ENV !== "production"
        ? "⚠️  SSL CHECK DISABLED (DEV MODE)"
        : "✅ Running in PRODUCTION mode"
    );
    console.log("======================================");
  });
}

start().catch((err) => {
  console.error("❌ Failed to start server:", err);
  process.exit(1);
});