export const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Common Ground — plans everyone in the group will love</title>
<meta name="description" content="An AI agent that bridges different tastes using Qloo Taste AI and plans a shared night out.">
<style>
:root{--bg:#0f1115;--card:#171a21;--mut:#9aa3b2;--acc:#ffb347;--acc2:#7bdcb5;--tx:#eef1f6}
*{box-sizing:border-box}body{margin:0;font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:var(--bg);color:var(--tx)}
.wrap{max-width:980px;margin:0 auto;padding:28px 18px 60px}h1{font-size:2.1rem;margin:.2em 0}h1 span{color:var(--acc)}
.sub{color:var(--mut);margin:0 0 18px}textarea{width:100%;min-height:130px;background:var(--card);color:var(--tx);border:1px solid #2a2f3a;border-radius:12px;padding:14px;font:inherit}
button{background:var(--acc);color:#1b1200;border:0;border-radius:10px;padding:12px 20px;font-weight:700;font-size:1rem;cursor:pointer}button:disabled{opacity:.5}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0 16px}.chip{background:#222734;color:var(--tx);border:1px solid #2f3646;border-radius:999px;padding:6px 12px;font-size:.85rem;cursor:pointer}
.card{background:var(--card);border:1px solid #232835;border-radius:14px;padding:16px;margin:14px 0}
.step{display:flex;gap:10px;align-items:flex-start;padding:6px 0;color:var(--mut);font-size:.92rem}.step b{color:var(--tx)}.dot{width:10px;height:10px;border-radius:50%;margin-top:7px;flex:none;background:#444}.run .dot{background:var(--acc);animation:p 1s infinite}.done .dot{background:var(--acc2)}
@keyframes p{50%{opacity:.3}}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:12px}
.venue img{width:100%;height:140px;object-fit:cover;border-radius:10px;background:#222}.venue h4{margin:8px 0 2px}.mut{color:var(--mut);font-size:.85rem}
.bar{height:6px;background:#2a2f3a;border-radius:4px;overflow:hidden;margin:2px 0 6px}.bar i{display:block;height:100%;background:var(--acc2)}
.tag{display:inline-block;font-size:.72rem;background:#232a38;border-radius:6px;padding:2px 6px;margin:2px}
.plan h3{color:var(--acc);margin-top:0}.plan li{margin:6px 0}.who{display:flex;flex-wrap:wrap;gap:10px}.who div{background:#1d2230;border-radius:10px;padding:8px 12px;font-size:.88rem}
.badge{font-size:.72rem;background:var(--acc);color:#1b1200;border-radius:6px;padding:1px 6px;margin-left:6px}footer{color:var(--mut);font-size:.8rem;margin-top:30px}a{color:var(--acc2)}
</style></head><body><div class="wrap">
<h1>Common <span>Ground</span></h1>
<p class="sub">Different tastes, one plan. Describe your group in plain words — the agent maps every person's taste with <b>Qloo Taste AI</b>, finds the venues, films and music that work for <i>everyone</i> (not just the loudest person), and writes the plan.</p>
<div class="chips" id="ex"></div>
<textarea id="t" placeholder="e.g. Date night in Rome. I love Radiohead and Wes Anderson films, she loves Taylor Swift and The Devil Wears Prada."></textarea>
<p><button id="go">Find our common ground</button></p>
<div id="out"></div>
<footer>Built for the Qloo Agentic Hackathon · Qloo Insights + Search APIs · Cloudflare Workers AI (Llama 3.3 70B) · <a href="https://github.com/Metsuryu/common-ground">source</a></footer>
</div><script>
const EX=["Date night in Rome. I love Radiohead and Wes Anderson films, she loves Taylor Swift and The Devil Wears Prada.","Team dinner in New York for 3: Priya loves Hamilton and Beyoncé, Tom is into The Witcher 3 and Metallica, Ana loves Studio Ghibli and Bon Iver.","Parents visiting me in London: Dad loves The Godfather and Frank Sinatra, Mum loves Downton Abbey and ABBA, I love Succession and Fred again..","Friends' night out in Milan: Luca likes Ferrari and Daft Punk, Giulia loves Harry Potter and Dua Lipa."];
const ex=document.getElementById('ex');EX.forEach(e=>{const c=document.createElement('span');c.className='chip';c.textContent=e.slice(0,48)+'…';c.onclick=()=>{t.value=e};ex.appendChild(c)});
const t=document.getElementById('t'),go=document.getElementById('go'),out=document.getElementById('out');
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function md(s){s=esc(s);return s.replace(/^### (.*)$/gm,'<h3>$1</h3>').replace(/\\*\\*(.+?)\\*\\*/g,'<b>$1</b>').replace(/^[-*] (.*)$/gm,'<li>$1</li>').replace(/(<li>[\\s\\S]*?<\\/li>)(?!\\s*<li>)/g,'<ul>$1</ul>').replace(/\\n{2,}/g,'<br>')}
go.onclick=async()=>{if(!t.value.trim())t.value=EX[0];go.disabled=true;out.innerHTML='<div class="card" id="trace"><b>Agent trace</b></div>';const tr=document.getElementById('trace');const steps={};
try{const r=await fetch('/api/plan',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text:t.value})});
if(!r.ok){throw new Error((await r.json()).error)}const rd=r.body.getReader();const dec=new TextDecoder();let buf='';
for(;;){const{value,done}=await rd.read();if(done)break;buf+=dec.decode(value,{stream:true});let i;while((i=buf.indexOf('\\n'))>=0){const line=buf.slice(0,i);buf=buf.slice(i+1);if(line)handle(JSON.parse(line))}}}
catch(e){out.insertAdjacentHTML('beforeend','<div class="card">⚠️ '+esc(e.message)+'</div>')}go.disabled=false;
function handle(m){if(m.type==='step'){let el=steps[m.id];if(!el){el=steps[m.id]=document.createElement('div');tr.appendChild(el)}if(m.label)el.dataset.l=m.label;el.className='step '+m.status;el.innerHTML='<span class="dot"></span><div><b>'+esc(el.dataset.l)+'</b>'+(m.detail?'<br>'+esc(m.detail):'')+'</div>'}
else if(m.type==='error'){out.insertAdjacentHTML('beforeend','<div class="card">⚠️ '+esc(m.message)+'</div>')}
else if(m.type==='result')render(m)}};
function render(m){const f=m.facts;let h='<div class="card plan">'+md(m.plan)+'</div>';
h+='<div class="card"><b>Who\\'s coming</b><div class="who">'+f.people.map(p=>'<div><b>'+esc(p.name)+'</b><br>'+p.likes.map(esc).join(' · ')+'</div>').join('')+'</div></div>';
for(const v of Object.values(f.venues)){h+='<div class="card"><b>'+esc(v.label)+'</b> <span class="mut">'+(v.mode==='shared'?'ranked by fairness — the lowest individual taste match':'joint taste match')+'</span><div class="grid">';
v.items.forEach((x,i)=>{h+='<div class="venue">'+(x.image?'<img loading="lazy" src="'+esc(x.image)+'">':'')+'<h4>'+esc(x.name)+(i===0?'<span class="badge">top pick</span>':'')+'</h4><div class="mut">'+esc([x.kind,x.neighborhood].filter(Boolean).join(' · '))+(x.price?' · '+'€'.repeat(x.price):'')+(x.rating?' · ★'+x.rating:'')+'</div>';
x.perPerson.forEach(p=>{const a=p.affinity??0;h+='<div class="mut">'+esc(p.name)+' '+Math.round(a*100)+'%</div><div class="bar"><i style="width:'+Math.round(a*100)+'%"></i></div>'});
h+=x.tags.map(g=>'<span class="tag">'+esc(g)+'</span>').join('')+'</div>'});h+='</div></div>'}
for(const[k,arr]of Object.entries(f.bridges||{})){if(!arr.length)continue;h+='<div class="card"><b>'+(k==='movie'?'🎬 A film you\\'d all enjoy':'🎵 Shared soundtrack')+'</b><div class="grid">'+arr.map(x=>'<div class="venue">'+(x.image?'<img loading="lazy" src="'+esc(x.image)+'">':'')+'<h4>'+esc(x.name)+(x.year?' ('+x.year+')':'')+'</h4>'+x.tags.map(g=>'<span class="tag">'+esc(g)+'</span>').join('')+'</div>').join('')+'</div></div>'}
out.insertAdjacentHTML('beforeend',h)}
</script></body></html>`;
