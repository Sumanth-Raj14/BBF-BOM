import { existsSync, rmSync } from 'fs';
['dist', '.vite'].forEach(d => { try { if (existsSync(d)) rmSync(d, { recursive: true, force: true }); } catch (_) {} });
