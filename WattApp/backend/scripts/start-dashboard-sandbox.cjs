const fs=require('node:fs');const path=require('node:path');
const file=path.resolve(__dirname,'../../.artifacts/dashboard-sandbox/backend.env');
if(!fs.existsSync(file))throw Error('Run npm run dashboard:setup first');
process.env.DOTENV_CONFIG_PATH=file;require('dotenv').config({path:file,override:true});
if(!['localhost','127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname))throw Error('Local dashboard sandbox required');
require('ts-node/register/transpile-only');require('../src/index');
