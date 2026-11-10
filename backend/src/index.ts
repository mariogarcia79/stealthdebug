// dotenv MUST be imported and configured first — subsequent module imports
// (app → routes → middleware → auth.middleware) check JWT_SECRET at load time.
import dotenv from "dotenv";
dotenv.config();

import { connectDB, disconnectDB } from './config/db';
import { createDefaultAdmin } from './config/defaultUsers';
import MediaService, { uploadDirProblem } from './services/media.service';
import app from "./app";

const PORT = process.env.PORT || 4000;

connectDB().then(() => {
  (async () => { await createDefaultAdmin(); })();

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

  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
});

process.on('SIGINT', async () => {
  await disconnectDB();
  process.exit(0);
});
