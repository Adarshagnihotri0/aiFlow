// Static UI only: no notebook store, proxy access, or production authentication.
import express from 'express';
import { fileURLToPath } from 'node:url';
const app = express();
app.use('/api', (_req, res) => res.status(501).json({ error: 'Browser tests must mock API requests.' }));
app.use(express.static(fileURLToPath(new URL('../../public', import.meta.url))));
app.listen(3211, '127.0.0.1');