/* Local npm install first; the bundled desktop runtime is an optional fallback. */
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
let playwright;
try{playwright=require('playwright');}
catch(error){
  const bundled=path.join(os.homedir(),'.cache','codex-runtimes','codex-primary-runtime','dependencies','node','node_modules','playwright');
  if(!fs.existsSync(bundled))throw Error('Install browser test dependencies with npm install, then npx playwright install chromium.');
  playwright=require(bundled);
}
exports.chromium=playwright.chromium;
exports.launchOptions=()=>{
  const explicit=process.env.SUIXIN_BROWSER_PATH;
  const edge=process.platform==='win32'?path.join(process.env['ProgramFiles(x86)']||'C:/Program Files (x86)','Microsoft','Edge','Application','msedge.exe'):'';
  return {headless:true,...(explicit?{executablePath:explicit}:edge&&fs.existsSync(edge)?{executablePath:edge}:{})};
};
