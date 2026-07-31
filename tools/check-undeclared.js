/* Calls to things that were never declared.
   Three bugs have had this exact shape: orbiting, WEB_TOOL, paintFinal — each a
   reference left behind when a range was removed. The parser cannot see them because
   they are valid syntax, and the proxy harness cannot see them unless that line runs. */
const fs=require('fs');
const src=fs.readFileSync(process.argv[2]||'previz-stage.html','utf8');
let raw=src.match(/<script type="module">([\s\S]*)<\/script>\s*$/)[1];
/* the embedded character is one enormous base64 literal; naive string stripping
   chokes on it and then sees the rest of the file as string contents */
raw=raw.replace(/[A-Za-z0-9+/=]{400,}/g,'BASE64');
let body=raw.replace(/\/\*[\s\S]*?\*\//g,' ')
         .replace(/^\s*\/\/[^\n]*/gm,' ')
         .replace(/`(?:\\.|[^\\`])*`/g,'`S`')
         .replace(/'(?:\\.|[^\\'])*'/g,"'S'")
         .replace(/"(?:\\.|[^\\"])*"/g,'"S"');

const declared=new Set();
/* declarations come from the raw text: they are never inside a string, and reading
   them there is immune to whatever the stripper gets wrong */
[...raw.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)/g)].forEach(m=>declared.add(m[1]));
[...body.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)].forEach(m=>declared.add(m[1]));
[...body.matchAll(/\b(?:const|let|var)\s*\{([^}]*)\}/g)].forEach(m=>
  m[1].split(',').forEach(x=>{const n=x.split(':').pop().trim().split('=')[0].trim();if(n)declared.add(n);}));
[...body.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*,\s*([A-Za-z_$][\w$]*)/g)]
  .forEach(m=>{declared.add(m[1]);declared.add(m[2]);});
[...body.matchAll(/([A-Za-z_$][\w$]*)\s*=>/g)].forEach(m=>declared.add(m[1]));
[...body.matchAll(/\(([^)]{0,120})\)\s*=>/g)].forEach(m=>
  m[1].split(',').forEach(x=>{const n=x.trim().split(/[=\s]/)[0];if(n)declared.add(n);}));
[...body.matchAll(/function[^(]*\(([^)]*)\)/g)].forEach(m=>
  m[1].split(',').forEach(x=>{const n=x.trim().split(/[=\s]/)[0];if(n)declared.add(n);}));
[...body.matchAll(/catch\s*\(\s*([A-Za-z_$][\w$]*)/g)].forEach(m=>declared.add(m[1]));

/* declared later in the file is still declared: function declarations hoist and const
   declarations inside a scope are visible to calls in that same scope. This is a
   whole-file check, so order does not matter. */
const GLOBALS=new Set(('THREE OrbitControls TransformControls GLTFLoader GLTFExporter SkeletonUtils '+
 'document window console Math JSON Object Array String Number Boolean Set Map Promise Date Error '+
 'setTimeout setInterval clearInterval clearTimeout requestAnimationFrame cancelAnimationFrame '+
 'fetch atob btoa parseInt parseFloat isFinite isNaN encodeURIComponent decodeURIComponent '+
 'Uint8Array Float32Array Int32Array Blob URL FileReader Image MediaRecorder VideoEncoder VideoFrame '+
 'ResizeObserver indexedDB performance devicePixelRatio alert confirm prompt Symbol RegExp Function '+
 'if for while switch catch return typeof instanceof new delete void yield await async of in '+
 'super this arguments constructor import function addEventListener').split(/\s+/));

/* every call that is not a method call */
const calls=new Map();
const lines=body.split('\n');
lines.forEach((l,i)=>{
  [...l.matchAll(/(^|[^.\w$])([A-Za-z_$][\w$]*)\s*\(/g)].forEach(m=>{
    const n=m[2];
    if(GLOBALS.has(n)||declared.has(n))return;
    if(!calls.has(n))calls.set(n,i+1);
  });
});
if(!calls.size)console.log('no calls to undeclared names');
else{
  console.log('CALLS TO UNDECLARED NAMES:');
  [...calls].forEach(([n,l])=>console.log('  L'+l+'  '+n+'()'));
  process.exitCode=1;
}
/* bare identifier reads of app-looking names */
const reads=new Map();
lines.forEach((l,i)=>{
  [...l.matchAll(/(^|[^.\w$'"])([a-z][A-Za-z0-9_$]{3,})(?=\s*(?:[.\)\],;=!<>&|?+\-*/]|$))/g)]
    .forEach(m=>{
      const n=m[2];
      if(GLOBALS.has(n)||declared.has(n)||calls.has(n))return;
      if(!reads.has(n))reads.set(n,i+1);
    });
});
const suspicious=[...reads].filter(([n])=>/^(paint|render|draw|set|update|ensure|apply|make|build)/.test(n));
if(suspicious.length){
  console.log('\nSUSPICIOUS READS:');
  suspicious.forEach(([n,l])=>console.log('  L'+l+'  '+n));
}
