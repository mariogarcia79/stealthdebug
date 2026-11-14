// dotenv MUST be imported and configured first: config/env.ts (imported by
// the app's modules) reads and checks the environment when it loads.
import dotenv from "dotenv";
dotenv.config();

import { connectDB, disconnectDB } from './config/db';
import { env } from './config/env';
import { createDefaultAdmin } from './config/defaultUsers';
import MediaService, { uploadDirProblem } from './services/media.service';
import app from "./app";
import { startMetricsServer } from './config/metrics';
import AgentImageService from './services/agentImages.service';

connectDB().then(() => {
  createDefaultAdmin().catch((err) => console.error('Default admin:', err));

  // Register existing uploads in the media library and create missing resized
  // copies. Runs in the background; never deletes or changes original files.
  (async () => {
    const problem = await uploadDirProblem();
    if (problem) {
      console.error(`Media: ${problem}`);
      return;   // the sync would only fail file by file
    }
    if (process.env.MEDIA_SYNC_ON_START === 'false') return;
    const s = await MediaService.syncLibrary();
    console.log(`Media sync: ${s.scanned} files, ${s.created} added, ${s.updated} updated, ${s.failed} failed`);
  })().catch((err) => console.error('Media sync failed:', err));

  // Agents' unpublished images that nothing uses expire (daily check)
  const purge = () => AgentImageService.purgeExpired()
    .then((n) => { if (n) console.log(`Agent images: ${n} expired removed`); })
    .catch((err) => console.error('Agent image purge failed:', err));
  purge();
  setInterval(purge, 24 * 3600_000).unref();

  // Prometheus (agents' tool calls, change requests): internal port only
  if (process.env.METRICS_PORT) startMetricsServer(Number(process.env.METRICS_PORT));

  const server = app.listen(env.port, () => {
    console.log(`Server running at http://localhost:${env.port}`);
  });

  // Podman stops the container with SIGTERM (Ctrl+C sends SIGINT): stop
  // accepting connections, let running requests finish, close the database.
  // A second signal, or 10 s without finishing, exits immediately.
  let stopping = false;
  const shutdown = (signal: string) => {
    if (stopping) process.exit(1);
    stopping = true;
    console.log(`${signal}: shutting down`);
    setTimeout(() => process.exit(1), 10_000).unref();
    server.close(async () => {
      await disconnectDB();
      process.exit(0);
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
});
