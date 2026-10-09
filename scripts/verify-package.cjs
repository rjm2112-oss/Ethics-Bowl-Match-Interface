'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),asar=require('@electron/asar');
const [directory,platform,arch]=process.argv.slice(2);
assert.ok(directory&&['linux','win','mac'].includes(platform)&&['x64','arm64'].includes(arch),'Usage: node scripts/verify-package.cjs OUTPUT_DIRECTORY linux|win|mac x64|arm64');
const output=path.resolve(directory),root=path.resolve(__dirname,'..'),pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):e.isFile()?[path.join(dir,e.name)]:[]);}
function digest(data){return crypto.createHash('sha256').update(data).digest('hex');}
async function hashFile(file){const h=crypto.createHash('sha256');for await(const block of fs.createReadStream(file))h.update(block);return h.digest('hex');}
function signature(file){const fd=fs.openSync(file,'r'),n=fs.statSync(file).size,head=Buffer.alloc(12),tail=Buffer.alloc(4);try{fs.readSync(fd,head,0,head.length,0);if(file.endsWith('.dmg'))fs.readSync(fd,tail,0,4,n-512);}finally{fs.closeSync(fd);}if(file.endsWith('.AppImage'))assert.equal(head.subarray(0,4).toString('hex'),'7f454c46','AppImage ELF signature');else if(file.endsWith('.exe'))assert.equal(head.subarray(0,2).toString(),'MZ','Windows PE signature');else if(file.endsWith('.zip'))assert.equal(head.subarray(0,2).toString(),'PK','ZIP signature');else assert.equal(tail.toString(),'koly','DMG footer signature');assert.ok(n>10_000_000,'Artifact unexpectedly small');}
(async()=>{
 const entries=walk(output),archives=entries.filter(f=>path.basename(f)==='app.asar');assert.equal(archives.length,1,'Exactly one packaged application archive is required');
 const archive=archives[0],names=asar.listPackage(archive).map(n=>n.replace(/^[/\\]+/,'').replace(/\\/g,'/'));
 assert.ok(!names.some(n=>n.split('/').some(p=>p.startsWith('.env')||['evidence','.rebuild','test','scripts'].includes(p))),'Private credentials, diagnostics or test data packaged');
 const expected=['main.js','preload.js','debater.html','debater.js','instructions.html','styles.css','app-logo.png','app-logo-black.png','ethics-bowl-logo.png','assets/app-icon.png','assets/icon.png'];
 for(const dir of ['src/main','src/shared','src/renderer','assets/fonts'])for(const f of walk(path.join(root,dir)))if(dir==='assets/fonts'||f.endsWith('.js'))expected.push(path.relative(root,f).replace(/\\/g,'/'));
 const sourceHashes={};for(const f of expected){assert.ok(names.includes(f),'Missing packaged file: '+f);const hash=digest(fs.readFileSync(path.join(root,f)));assert.equal(digest(asar.extractFile(archive,f)),hash,'Packaged source differs: '+f);sourceHashes[f]=hash;}
 const packaged=JSON.parse(asar.extractFile(archive,'package.json').toString());assert.equal(packaged.main,pkg.main);assert.equal(packaged.version,pkg.version);assert.equal(packaged.name,pkg.name);
 const extensions=platform==='linux'?['.AppImage']:platform==='win'?['.exe']:['.dmg','.zip'];const artifacts=fs.readdirSync(output).filter(n=>extensions.some(e=>n.endsWith(e)));assert.equal(artifacts.length,platform==='linux'?1:2,'Expected distributables missing or duplicated');
 if(platform==='win'){assert.ok(artifacts.some(n=>n.endsWith('-setup.exe')));assert.ok(artifacts.some(n=>n.endsWith('-portable.exe')));}
 const records=[];for(const name of artifacts){assert.ok(name.includes(`-${platform}-${arch}`),'Artifact architecture label missing');const file=path.join(output,name);signature(file);records.push({name,bytes:fs.statSync(file).size,sha256:await hashFile(file)});}
 const report={verified:true,platform,arch,version:pkg.version,archive:path.relative(output,archive).replace(/\\/g,'/'),archiveSha256:await hashFile(archive),packagedSourceFiles:expected.length,sourceHashes,artifacts:records,privateFilesExcluded:true};
 fs.writeFileSync(path.join(output,'package-verification.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({verified:true,platform,arch,packagedSourceFiles:expected.length,artifacts:records}));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
