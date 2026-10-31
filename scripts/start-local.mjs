import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const cli=fileURLToPath(new URL('../node_modules/vinext/dist/cli.js',import.meta.url));
if(!existsSync(cli)){console.error('网站依赖尚未安装，请先运行 npm run install:ci。');process.exit(1);}
console.log('法律与信念：本机预览地址 http://localhost:5173/');
const child=spawn(process.execPath,[cli,'dev','--port','5173'],{cwd:root,stdio:'inherit',windowsHide:true});
child.on('error',error=>{console.error(error.message);process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code??0;});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
