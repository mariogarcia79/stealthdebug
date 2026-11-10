// dotenv MUST be imported and configured first — subsequent module imports
// (app → routes → middleware → auth.middleware) check JWT_SECRET at load time.
import dotenv from "dotenv";
dotenv.config();

import { connectDB, disconnectDB } from './config/db';
import { createDefaultAdmin } from './config/defaultUsers';
import app from "./app";

const PORT = process.env.PORT || 4000;

connectDB().then(() => {
  (async () => { await createDefaultAdmin(); })();

  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
});

process.on('SIGINT', async () => {
  await disconnectDB();
  process.exit(0);
});
