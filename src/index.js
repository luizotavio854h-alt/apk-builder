import { verifyKey, InteractionType, InteractionResponseType } from 'discord-interactions';
import JSZip from 'jszip';
const API='https://discord.com/api/v10';
const reply=(content,ephemeral=false)=>Response.json({type:InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,data:{content,flags:ephemeral?64:0,allowed_mentions:{parse:[]}}});
const defer=()=>Response.json({type:InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,data:{flags:64}});
const opt=(i,name)=>i.data.options?.find(o=>o.name===name)?.value;
const str=(name,description,required=true)=>({name,description,type:3,required});
const uid=i=>i.member?.user?.id||i.user?.id;
const admin=i=>(BigInt(i.member?.permissions||'0')&8n)!==0n;
const isHttps=s=>{try{const u=new URL(s);return u.protocol==='https:'&&!['localhost','127.0.0.1','0.0.0.0','::1'].includes(u.hostname)&&!u.hostname.endsWith('.local')}catch{return false}};
async function discord(env,path,init={}){const r=await fetch(`${API}${path}`,{...init,headers:{Authorization:`Bot ${env.DISCORD_BOT_TOKEN}`,'Content-Type':'application/json',...(init.headers||{})}});if(!r.ok)throw Error(`Discord ${r.status}: ${(await r.text()).slice(0,500)}`);return r.status===204?null:r.json()}
async function editReply(i,data){const r=await fetch(`${API}/webhooks/${i.application_id}/${i.token}/messages/@original`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({allowed_mentions:{parse:[]},...data})});if(!r.ok)throw Error(`Interaction edit ${r.status}`)}
async function sendBuildTicketWelcome(env,channelId,user,workerUrl){
 const uploadUrl=await createZipUploadLink(env,channelId,user,workerUrl);
 await discord(env,`/channels/${channelId}/messages`,{method:'POST',body:JSON.stringify({embeds:[{author:{name:'AURORA ANDROID ENGINE  •  CENTRAL DO PROJETO'},title:'🌌 Seu espaço de compilação',description:`Bem-vindo <@${user}>! Este canal é seu espaço privado para enviar o projeto, editar com a Aurora AI e gerar o APK.`,color:0x5268e8,fields:[{name:'📦  Enviar seu projeto',value:'Use o botão **Enviar ZIP** para carregar o arquivo pelo navegador. Também é possível usar `/importar` com um link público.',inline:true},{name:'🧠  Editar com IA',value:'Use `/editar` para escolher uma source e pedir as alterações.',inline:true},{name:'🏗️  Compilar APK',value:'Use `/compilar` ou o botão abaixo. O progresso e o link final aparecem aqui.',inline:false}],footer:{text:'AURORA  •  Arquivos enviados são salvos no GoFile'},timestamp:new Date().toISOString()}],components:[{type:1,components:[{type:2,style:1,label:'Compilar APK',emoji:{name:'🏗️'},custom_id:'compilar_apk'},{type:2,style:2,label:'Editar com IA',emoji:{name:'🧠'},custom_id:'aurora_edit_button'},{type:2,style:2,label:'Minhas Sources',emoji:{name:'📚'},custom_id:'aurora_sources_button'},{type:2,style:5,label:'Enviar ZIP',emoji:{name:'📤'},url:uploadUrl},{type:2,style:4,label:'Fechar Ticket',emoji:{name:'🔒'},custom_id:'aurora_close_ticket'}]}],allowed_mentions:{users:[user]}})});
}
async function makeTicket(i,env,workerUrl){const guild=i.guild_id,user=uid(i),cat=env.TICKET_CATEGORY_ID;if(!guild||!cat)throw Error('Defina TICKET_CATEGORY_ID no Cloudflare');const key=`ticket:${guild}:${user}`;let existing=await env.TICKETS.get(key);if(existing){let valid=true;try{await discord(env,`/channels/${existing}`)}catch{valid=false;await env.TICKETS.delete(key)}if(valid){await sendBuildTicketWelcome(env,existing,user,workerUrl);return `Você já possui um ticket: <#${existing}>`}}
const staff=env.STAFF_ROLE_ID;const overwrites=[{id:guild,type:0,deny:'1024'},{id:user,type:1,allow:'3072'}];if(staff)overwrites.push({id:staff,type:0,allow:'3072'});
const ch=await discord(env,`/guilds/${guild}/channels`,{method:'POST',body:JSON.stringify({name:`aurora-${user.slice(-6)}`,type:0,parent_id:cat,permission_overwrites:overwrites})});await env.TICKETS.put(key,ch.id);await env.TICKETS.put(`owner:${ch.id}`,user);
await sendBuildTicketWelcome(env,ch.id,user,workerUrl);return `Ticket criado: <#${ch.id}>`}
async function createSupportTicket(i,env,category){
 const guild=i.guild_id,user=uid(i),kind=category==='buy'?'compras':'suporte';
 if(!guild||!env.SUPPORT_CATEGORY_ID)throw Error('Configure SUPPORT_CATEGORY_ID no Worker.');
 const key=`support-ticket:${guild}:${user}`,existing=await env.TICKETS.get(key);
 if(existing){try{await discord(env,`/channels/${existing}`);return `Você já possui atendimento aberto: <#${existing}>`;}catch{await env.TICKETS.delete(key)}}
 const overwrites=[{id:guild,type:0,deny:'1024'},{id:user,type:1,allow:'3072'}];if(env.STAFF_ROLE_ID)overwrites.push({id:env.STAFF_ROLE_ID,type:0,allow:'3072'});
 const ch=await discord(env,`/guilds/${guild}/channels`,{method:'POST',body:JSON.stringify({name:`${kind}-${user.slice(-6)}`,type:0,parent_id:env.SUPPORT_CATEGORY_ID,permission_overwrites:overwrites})});
 const opened=Date.now(),info={guild_id:guild,owner_id:user,category,opened_at:opened,channel_id:ch.id};await env.TICKETS.put(key,ch.id);await env.TICKETS.put(`support:${ch.id}`,JSON.stringify(info));
 await discord(env,`/channels/${ch.id}/messages`,{method:'POST',body:JSON.stringify({content:`🎫 **Atendimento Aurora — ${category==='buy'?'🛒 Comprar Aplicativos':'🛠️ Suporte Técnico'}**\nOlá <@${user}>! Nossa equipe atenderá você por aqui.\n🔒 Aberto em <t:${Math.floor(opened/1000)}:F>.`,components:[{type:1,components:[{type:2,style:4,label:'🔒 Fechar atendimento',custom_id:'support:close'}]}],allowed_mentions:{parse:[]}})});
 return `Atendimento criado: <#${ch.id}>`;
}
async function closeSupportTicket(env,channelId){
 const raw=await env.TICKETS.get(`support:${channelId}`);if(!raw)throw Error('Atendimento não encontrado.');const info=JSON.parse(raw);info.closed_at=Date.now();
 const messages=await discord(env,`/channels/${channelId}/messages?limit=100`),transcript=messages.reverse().map(m=>`[${m.timestamp}] ${m.author?.username||'?'}: ${String(m.content||'').replace(/\s+/g,' ')}`).join('\n').slice(0,17000);
 if(env.SUPPORT_LOG_CHANNEL_ID)await discord(env,`/channels/${env.SUPPORT_LOG_CHANNEL_ID}/messages`,{method:'POST',body:JSON.stringify({content:`🔒 Ticket encerrado • <@${info.owner_id}> • ${info.category} • Aberto <t:${Math.floor(info.opened_at/1000)}:F> • Fechado <t:${Math.floor(info.closed_at/1000)}:F>\n\`\`\`\n${transcript.slice(-1500)}\n\`\`\``,allowed_mentions:{parse:[]}})});
 await env.TICKETS.delete(`support-ticket:${info.guild_id}:${info.owner_id}`);await env.TICKETS.delete(`support:${channelId}`);await discord(env,`/channels/${channelId}`,{method:'DELETE'});
}
async function publishSupportPanel(i,env,deferred=false){
 if(!admin(i))return reply('Somente administradores podem publicar o painel.',true);
 const channel=env.SUPPORT_PANEL_CHANNEL_ID;if(!/^\d{15,25}$/.test(channel||''))return reply('Configure SUPPORT_PANEL_CHANNEL_ID no Worker.',true);
 await discord(env,`/channels/${channel}/messages`,{method:'POST',body:JSON.stringify({
  embeds:[{
   author:{name:'AURORA NETWORK  •  CENTRAL DE ATENDIMENTO'},
   title:'🌌 Como podemos ajudar?',
   description:'Escolha o departamento ideal e nossa equipe continuará o atendimento em um **canal privado**.\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
   color:0x7657e8,
   fields:[
    {name:'🛒  Comprar Aplicativos',value:'Tire dúvidas sobre **compras**, catálogo e disponibilidade de aplicativos.',inline:true},
    {name:'🛠️  Suporte Técnico',value:'Peça ajuda com **instalação**, configuração ou problemas técnicos.',inline:true},
    {name:'🔒  Atendimento privado',value:'Só você e a equipe autorizada poderão ver o canal criado.',inline:false}
   ],
   footer:{text:'Aurora Network  •  Selecione uma categoria abaixo'},
   timestamp:new Date().toISOString()
  }],
  components:[{type:1,components:[{type:3,custom_id:'support:select',placeholder:'🎫  Selecione uma categoria de atendimento',min_values:1,max_values:1,options:[
   {label:'Comprar Aplicativos',value:'buy',description:'Dúvidas sobre compras e aplicativos',emoji:{name:'🛒'}},
   {label:'Suporte Técnico',value:'tech',description:'Ajuda técnica e solução de problemas',emoji:{name:'🛠️'}}
  ]}]}]
 })});
 return deferred?editReply(i,{content:'🎫 Painel de atendimento publicado.'}):reply('🎫 Painel de atendimento publicado.',true);
}
function buildTicketPanel(){return Response.json({type:4,data:{embeds:[{
 author:{name:'AURORA ANDROID ENGINE  •  CENTRAL DE BUILDS'},
 title:'📱 Transforme seu projeto em um APK',
 description:'Abra um espaço privado para preparar seu projeto, pedir ajuda à Aurora AI e acompanhar a compilação.',
 color:0x5268e8,
 fields:[
  {name:'📦  Envie seu projeto',value:'Envie o ZIP pelo portal privado ou use /importar com um link público.',inline:true},
  {name:'🧠  Edite com a Aurora AI',value:'Peça ajustes no código e revise cada versão.',inline:true},
  {name:'🏗️  Acompanhe a build',value:'Veja o progresso e receba o link do APK na mensagem original.',inline:false}
 ],
 footer:{text:'AURORA  •  Seus arquivos e atendimento ficam neste ticket'},
 timestamp:new Date().toISOString()
}],components:[{type:1,components:[{type:2,style:1,label:'Compilar APK',emoji:{name:'🏗️'},custom_id:'aurora_open_ticket'}]}]}})}
async function fetchZip(url){
 if(!isHttps(url))throw Error('Informe um link HTTPS válido.');
 const limit=12*1024*1024;
 async function get(link,depth=0){
  if(depth>2)throw Error('Não foi possível resolver o link de download.');
  const r=await fetch(link,{redirect:'follow',headers:{'User-Agent':'Mozilla/5.0 (compatible; AuroraImporter/2.0)','Accept':'application/zip,application/octet-stream,text/html;q=0.8,*/*;q=0.5'},signal:AbortSignal.timeout(30000)});
  if(!r.ok){if(r.status===403)throw Error('O servidor da origem bloqueou o download do Worker (HTTP 403). No ticket, use /enviar-zip para carregar o arquivo pelo navegador e salvar no GoFile sem depender desse link.');throw Error(`O servidor da origem recusou o download (HTTP ${r.status}). Confira se o link está público e válido.`)}
  if(!isHttps(r.url))throw Error('Redirecionamento para URL insegura.');
  const length=Number(r.headers.get('content-length')||0);
  if(length>limit)throw Error('ZIP acima de 12 MB para importação via Worker.');
  const type=r.headers.get('content-type')||'';
  if(type.includes('text/html')){
   const html=await r.text();
   const finalHost=new URL(r.url).hostname.toLowerCase();
   if(finalHost==='gofile.io'||finalHost==='www.gofile.io'){
    const normalized=html.replaceAll('\\u0026','&').replaceAll('\\/','/').replaceAll('&amp;','&');
    const urls=[...normalized.matchAll(/https?:\/\/[a-z0-9-]+\.gofile\.io\/download\/web\/[a-z0-9-]+\/[^\s"'<>\\]+/gi)].map(m=>m[0]);
    const direct=urls.find(candidate=>{try{const u=new URL(candidate);return u.protocol==='https:'&&/^[a-z0-9-]+\.gofile\.io$/i.test(u.hostname)&&u.pathname.includes('/download/web/')}catch{return false}});
    if(!direct)throw Error('Não consegui resolver o link público do GoFile. Envie o link direto do arquivo (não apenas a página da pasta).');
    return get(direct,depth+1);
   }
   if(!/(^|\.)mediafire\.com$/i.test(finalHost))throw Error('O link devolveu uma página HTML, não um ZIP. Use link direto do GoFile ou do download.');
   const candidates=[...html.matchAll(/(?:href|data-href)=["'](https:\/\/[^"']+)["']/gi)].map(m=>m[1].replace(/&amp;/g,'&'));
   const direct=candidates.find(u=>{try{const h=new URL(u).hostname;return /(^|\.)mediafire\.com$/i.test(h)&&/\/download|\/file\//i.test(u)&&u!==r.url}catch{return false}});
   if(!direct)throw Error('MediaFire não forneceu um link direto acessível. Abra o MediaFire e copie o link real do botão Download.');
   return get(direct,depth+1);
  }
  const b=await r.arrayBuffer();
  if(b.byteLength>limit)throw Error('ZIP acima de 12 MB para importação via Worker.');
  const bytes=new Uint8Array(b);
  if(bytes.length<4||bytes[0]!==80||bytes[1]!==75)throw Error(`A URL não devolveu um ZIP (tipo: ${type||'desconhecido'}).`);
  try{await JSZip.loadAsync(b)}catch{throw Error('O arquivo recebido está incompleto ou não é um ZIP válido.');}
  return b;
 }
 return get(url);
}
const GOFILE_UPLOAD_URL='https://upload.gofile.io/uploadfile';
function validGofileUrl(value){try{const u=new URL(value);return u.protocol==='https:'&&/(^|\.)gofile\.io$/i.test(u.hostname)}catch{return false}}
async function uploadGofile(bytes,filename,contentType='application/zip'){
 const form=new FormData();form.append('file',new Blob([bytes],{type:contentType}),filename);
 let response,data;try{response=await fetch(GOFILE_UPLOAD_URL,{method:'POST',body:form,signal:AbortSignal.timeout(180000)});data=await response.json()}catch(e){throw Error(`Upload GoFile falhou por conexão ou resposta inválida (${e.name||'erro'}).`)}
 if(!response.ok||data?.status!=='ok')throw Error(`GoFile recusou o upload (${response.status}, ${String(data?.status||'resposta inválida').slice(0,80)}).`);
 const d=data.data||{},downloadPage=d.downloadPage||'',id=d.id||'',server=d.serverSelected||d.servers?.[0]||'',fileName=d.name||filename;
 let directUrl=d.link||'';if(!directUrl&&/^[a-z0-9-]{8,80}$/i.test(id)&&/^[a-z0-9-]+$/i.test(server))directUrl=`https://${server}.gofile.io/download/web/${id}/${encodeURIComponent(fileName)}`;
 if(!validGofileUrl(downloadPage)||!validGofileUrl(directUrl))throw Error('GoFile confirmou o envio, mas não retornou dados públicos de download válidos.');
 const guestToken=d.guestToken||d.token||'';if(typeof guestToken!=='string'||!/^[-A-Za-z0-9._~]{12,4096}$/.test(guestToken))throw Error('GoFile não retornou uma credencial Guest válida para reabrir o ZIP pela IA.');
 return {downloadPage,directUrl,fileId:id,guestToken,name:fileName,size:Number(d.size)||bytes.byteLength};
}
const ZIP_UPLOAD_LIMIT=20_000_000_000;
function formatFileSize(size){return size>=1e9?`${(size/1e9).toFixed(2)} GB`:`${(size/1e6).toFixed(1)} MB`}
function uploadPageHtml(title,message,token=''){
 const escape=value=>String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
 const form=token?`<form id="zip-form"><label for="zip">Arquivo ZIP do projeto</label><input id="zip" name="zip" type="file" accept=".zip,application/zip" required><p>Até 20 GB. O navegador envia o arquivo diretamente ao GoFile. A IA indexa ZIPs de até 600 MB (3 GB descompactados) pelo comando /editar.</p><progress id="upload-progress" max="100" value="0" hidden></progress><p id="upload-status" role="status" aria-live="polite"></p><button id="upload-button" type="submit">Enviar ZIP</button></form><script>(()=>{const max=${ZIP_UPLOAD_LIMIT},form=document.getElementById('zip-form'),input=document.getElementById('zip'),progress=document.getElementById('upload-progress'),status=document.getElementById('upload-status'),button=document.getElementById('upload-button');const say=text=>status.textContent=text;const fmt=n=>n>=1e9?(n/1e9).toFixed(2)+' GB':(n/1e6).toFixed(1)+' MB';form.addEventListener('submit',async event=>{event.preventDefault();const file=input.files&&input.files[0];if(!file)return say('Escolha um ZIP antes de enviar.');if(!/\\.zip$/i.test(file.name))return say('Selecione um arquivo com extensão .zip.');if(file.size<4||file.size>max)return say('O arquivo precisa ter até 20 GB.');const head=new Uint8Array(await file.slice(0,4).arrayBuffer());if(head[0]!==80||head[1]!==75)return say('O arquivo selecionado não parece ser um ZIP.');button.disabled=true;input.disabled=true;progress.hidden=false;progress.value=0;say('Conectando ao GoFile…');const id=crypto.randomUUID(),body=new FormData();body.append('file',file,'aurora-source-'+id+'-'+file.name);const xhr=new XMLHttpRequest();xhr.open('POST','https://upload.gofile.io/uploadfile');xhr.upload.onprogress=e=>{if(e.lengthComputable){progress.value=Math.round(e.loaded/e.total*100);say('Enviando ao GoFile: '+progress.value+'% ('+fmt(e.loaded)+' / '+fmt(e.total)+')')}};xhr.onerror=()=>{button.disabled=false;input.disabled=false;say('Falha de conexão com o GoFile. Tente novamente com uma conexão estável.')};xhr.onload=async()=>{let uploaded;try{uploaded=JSON.parse(xhr.responseText)}catch{button.disabled=false;input.disabled=false;return say('O GoFile retornou uma resposta inválida.')};if(xhr.status<200||xhr.status>=300||uploaded.status!=='ok'||!uploaded.data){button.disabled=false;input.disabled=false;return say('O GoFile não aceitou o arquivo ('+(uploaded.status||xhr.status)+'). Confira os limites da sua conta GoFile.')};say('Upload concluído. Associando o ZIP ao ticket…');try{const response=await fetch(location.href,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,name:file.name,size:file.size,upload:uploaded})});const result=await response.json();if(!response.ok||!result.ok)throw Error(result.error||'Não foi possível associar o ZIP ao ticket.');form.remove();document.querySelector('h1').textContent='🌌 '+result.title;document.querySelector('.card>p').textContent=result.message}catch(error){button.disabled=false;input.disabled=false;say(error.message||'Falha ao registrar o ZIP no ticket.')}};xhr.send(body)})})();</script>`:'';
 const html=`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>${escape(title)} • Aurora</title><style>:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:radial-gradient(ellipse at top,#263769,#0c1020 65%);color:#f5f7ff;font:16px/1.5 system-ui,Segoe UI,sans-serif}.card{width:min(100%,560px);padding:32px;border:1px solid #414d76;border-radius:24px;background:#141a2beF;box-shadow:0 24px 80px #0008}h1{margin:0 0 10px;font-size:28px}p{color:#c2cbe5}label{display:block;margin:22px 0 8px;font-weight:700}input[type=file]{width:100%;padding:14px;border:1px solid #46557e;border-radius:12px;background:#0e1424;color:#e9edfa}progress{width:100%;height:14px;margin-top:14px;accent-color:#7187ff}button{width:100%;margin-top:18px;padding:14px;border:0;border-radius:12px;background:#7187ff;color:white;font-weight:800;font-size:16px;cursor:pointer}button:hover{background:#8295ff}button:disabled{opacity:.6;cursor:wait}.brand{margin-top:24px;color:#91a2d3;font-size:12px;letter-spacing:.14em}</style><main class="card"><h1>🌌 ${escape(title)}</h1><p>${escape(message)}</p>${form}<div class="brand">AURORA ANDROID ENGINE • GOFILE</div></main></html>`;
 return new Response(html,{status:200,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; connect-src 'self' https://upload.gofile.io; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"}});
}
async function createZipUploadLink(env,channelId,userId,workerUrl){
 const origin=new URL(workerUrl||env.WORKER_URL||'');if(!isHttps(origin.href))throw Error('URL pública HTTPS do Worker indisponível para o portal de ZIP.');
 const token=crypto.randomUUID();await env.TICKETS.put(`zip-upload:${token}`,JSON.stringify({channel_id:channelId,user_id:userId,uploads:0}),{expirationTtl:86400});
 return `${origin.origin}/upload?token=${encodeURIComponent(token)}`;
}
async function uploadSession(env,token){
 if(!/^[a-f0-9-]{36}$/i.test(token||''))return null;
 const raw=await env.TICKETS.get(`zip-upload:${token}`);if(!raw)return null;
 let session;try{session=JSON.parse(raw)}catch{return null}
 if(!/^\d{15,25}$/.test(session.channel_id||'')||!/^\d{15,25}$/.test(session.user_id||''))return null;
 if(await env.TICKETS.get(`owner:${session.channel_id}`)!==session.user_id)return null;
 return session;
}
async function zipUploadRoute(request,env){
 const url=new URL(request.url),token=url.searchParams.get('token')||'';
 if(request.method==='GET'){
  if(!await uploadSession(env,token))return uploadPageHtml('Link expirado','Volte ao ticket e use /enviar-zip para gerar um novo link.');
  return uploadPageHtml('Enviar projeto ZIP','Escolha o ZIP do seu projeto Android.',token);
 }
 if(request.method!=='POST')return new Response('Method Not Allowed',{status:405,headers:{Allow:'GET, POST'}});
 const respond=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
 if(request.headers.get('origin')!==url.origin)return respond({ok:false,error:'Envio bloqueado. Abra o portal pelo botão do ticket.'},403);
 const session=await uploadSession(env,token);if(!session)return respond({ok:false,error:'Link expirado. Gere outro pelo comando /enviar-zip.'},410);
 if(Number(session.uploads||0)>=5)return respond({ok:false,error:'Limite deste link atingido. Gere outro pelo comando /enviar-zip.'},429);
 const contentLength=Number(request.headers.get('content-length')||0);if(contentLength>128*1024)return respond({ok:false,error:'Os metadados do envio são grandes demais.'},413);
 let body;try{body=await request.json()}catch{return respond({ok:false,error:'Resposta de upload inválida.'},400)}
 const id=String(body.id||''),originalName=String(body.name||''),size=Number(body.size),upload=body.upload;
 if(!/^[a-f0-9-]{36}$/i.test(id)||!/\.zip$/i.test(originalName)||!Number.isSafeInteger(size)||size<4||size>ZIP_UPLOAD_LIMIT)return respond({ok:false,error:'Arquivo inválido ou acima do limite de 20 GB.'},400);
 if(upload?.status!=='ok'||!upload.data)return respond({ok:false,error:'O GoFile não confirmou o envio.'},400);
 const d=upload.data,uploadedSize=Number(d.size)||size,fileId=String(d.id||''),fileName=String(d.name||`aurora-source-${id}-${originalName}`),guestToken=d.guestToken||d.token||'',server=String(d.serverSelected||d.servers?.[0]||'');
 const directUrl=d.link||(/^[a-z0-9-]{8,80}$/i.test(fileId)&&/^[a-z0-9-]+$/i.test(server)?`https://${server}.gofile.io/download/web/${fileId}/${encodeURIComponent(fileName)}`:'');
 const code=String(d.parentFolderCode||d.code||''),downloadPage=d.downloadPage||(/^[-A-Za-z0-9]{6,20}$/.test(code)?`https://gofile.io/d/${code}`:'');
 if(!Number.isSafeInteger(uploadedSize)||uploadedSize<4||uploadedSize>ZIP_UPLOAD_LIMIT)return respond({ok:false,error:'O GoFile informou um tamanho inválido para o arquivo.'},400);
 if(!/^[a-f0-9-]{8,80}$/i.test(fileId)||!validGofileUrl(downloadPage)||!validGofileUrl(directUrl)||typeof guestToken!=='string'||!/^[-A-Za-z0-9._~]{12,4096}$/.test(guestToken))return respond({ok:false,error:'O GoFile não retornou metadados Guest válidos para o ZIP.'},400);
 const safeName=originalName.split(/[\\/]/).pop().replace(/[^\w. -]/g,'_').slice(0,90)||'projeto.zip';
 const stored={downloadPage,directUrl,fileId,guestToken,name:fileName,size:uploadedSize};
 try{
  const key=`sources:${session.channel_id}:${session.user_id}`,items=JSON.parse(await env.TICKETS.get(key)||'[]');
  items.unshift({id,original_file:stored,summary:`ZIP enviado pelo portal: ${safeName}`,status:'approved',created:new Date().toISOString()});
  await env.TICKETS.put(key,JSON.stringify(items.slice(0,30)));
  session.uploads=Number(session.uploads||0)+1;await env.TICKETS.put(`zip-upload:${token}`,JSON.stringify(session),{expirationTtl:86400});
  try{await discord(env,`/channels/${session.channel_id}/messages`,{method:'POST',body:JSON.stringify({content:`📦 ZIP de ${formatFileSize(uploadedSize)} recebido pelo portal e salvo no GoFile. Source: \`${id}\`\nUse /editar para indexar ZIPs de até 600 MB (3 GB descompactados).`,allowed_mentions:{parse:[]}})})}catch(e){console.error('Upload notice:',String(e.message))}
  return respond({ok:true,title:'ZIP recebido!',message:'Seu projeto foi salvo no GoFile e adicionado às Sources do ticket. Use /editar para indexar ZIPs de até 600 MB (3 GB descompactados).'});
 }catch(e){console.error('Portal ZIP / GoFile:',String(e.message));return respond({ok:false,error:'O ZIP foi enviado, mas não consegui associá-lo ao ticket. Use /sources para verificar ou gere um novo link.'},500)}
}
async function importSource(i,env,url){
 const owner=await env.TICKETS.get(`owner:${i.channel_id}`)||uid(i),original=await fetchZip(url),id=crypto.randomUUID();
 const stored=await uploadGofile(original,`aurora-source-${id}.zip`),key=`sources:${i.channel_id}:${owner}`,items=JSON.parse(await env.TICKETS.get(key)||'[]');
 items.unshift({id,original_file:stored,summary:'Source importada',status:'approved',created:new Date().toISOString()});
 await env.TICKETS.put(key,JSON.stringify(items.slice(0,30)));
 await editReply(i,{content:'📦 Source salva no GoFile! ID: `'+id+'`\nUse /editar com esse ID para propor alterações.'});
}async function manageVersion(i,env,action,id,request){
 const owner=uid(i),key=`sources:${i.channel_id}:${owner}`,items=JSON.parse(await env.TICKETS.get(key)||'[]'),item=items.find(x=>x.id===id);
 if(!item)return reply('Versão não encontrada no seu ticket.',true);
 if(action==='baixar'){
  const file=item.summary==='Source importada'||item.status==='rejected'?item.original_file:(item.edited_file||item.original_file);
  if(!file||!validGofileUrl(file.downloadPage))return reply('Arquivo GoFile indisponível.',true);
  return reply('📦 [Baixar ZIP no GoFile]('+file.downloadPage+')',true);
 }
 if(item.status!=='pending')return reply('Essa versão já foi avaliada.',true);
 item.status=action==='aprovar'?'approved':'rejected';await env.TICKETS.put(key,JSON.stringify(items));
 return reply(item.status==='approved'?'✅ Alteração aprovada. A source original continua preservada no GoFile.':'❌ Alteração rejeitada. A source original continua preservada no GoFile.',true);
}// Menu de seleção por ticket: cada source é isolada pelo ID do canal e proprietário.
function aiProjectKey(channel,user,source){return `ai-project:${channel}:${user}:${source}`}
function aiJobKey(id){return `ai-job:${id}`}
function fileSizeLabel(size){return size>=1024*1024?`${(size/1024/1024).toFixed(1)} MB`:`${Math.max(1,Math.round(size/1024))} KB`}
function clipped(value,length){const text=String(value||'');return text.length>length?text.slice(0,length-1)+'…':text}
function fileGridPayload(source,manifest,page=0){
 const files=manifest.files||[],pages=Math.max(1,Math.ceil(files.length/20)),current=Math.min(Math.max(0,page),pages-1),start=current*20,selected=files.slice(start,start+20),rows=[];
 for(let row=0;row<4;row++){const group=selected.slice(row*5,row*5+5);if(group.length)rows.push({type:1,components:group.map((file,n)=>({type:2,style:2,label:clipped(file.path,72),emoji:{name:file.editable?'📝':'📦'},custom_id:`aurora-file:${source.id}:${start+row*5+n}`}))})}
 if(pages>1){const nav=[];if(current>0)nav.push({type:2,style:2,label:'Anterior',emoji:{name:'⬅️'},custom_id:`aurora-files-page:${source.id}:${current-1}`});if(current<pages-1)nav.push({type:2,style:2,label:'Próxima',emoji:{name:'➡️'},custom_id:`aurora-files-page:${source.id}:${current+1}`});rows.push({type:1,components:nav})}
 const listing=selected.map((file,n)=>`${start+n+1}. ${file.editable?'📝':'📦'} \`${clipped(file.path,150).replaceAll('`','ˋ')}\` · ${fileSizeLabel(file.size)}`).join('\n');
 return {embeds:[{author:{name:'AURORA AI  •  EXPLORADOR DO PROJETO'},title:'📂 Escolha um arquivo para editar',description:`Projeto \`${source.id.slice(0,8)}\` · **${files.length} arquivos** · página **${current+1}/${pages}**\n\n${listing}\n\n📝 Texto/código de até 64 KB  •  📦 binário, protegido ou grande`,color:0x5268e8,footer:{text:'O arquivo escolhido e o contexto técnico seguem para a IA editar'}}],components:rows,allowed_mentions:{parse:[]}};
}
async function publishFileGrid(env,channel,source,manifest,page=0,messageId=''){
 const payload=fileGridPayload(source,manifest,page);
 if(messageId){try{return await discord(env,`/channels/${channel}/messages/${messageId}`,{method:'PATCH',body:JSON.stringify(payload)})}catch{return discord(env,`/channels/${channel}/messages`,{method:'POST',body:JSON.stringify(payload)})}}
 return discord(env,`/channels/${channel}/messages`,{method:'POST',body:JSON.stringify(payload)});
}
async function dispatchAiTask(env,sourceId,sourceFile,channel,user,task,extra={},workerUrlOverride=''){
 for(const key of ['GITHUB_TOKEN','GITHUB_USER','GITHUB_REPO','GITHUB_REF','CALLBACK_SECRET'])if(!env[key])throw Error(`Configure ${key} no Worker antes de usar a edição por IA.`);
 const workerUrl=String(workerUrlOverride||env.WORKER_URL||'').replace(/\/+$/,'');if(!isHttps(workerUrl))throw Error('Não consegui determinar o endereço HTTPS público do Worker.');
 if(!sourceFile||!validGofileUrl(sourceFile.directUrl)||!/^[-A-Za-z0-9._~]{12,4096}$/.test(String(sourceFile.guestToken||'')))throw Error('O ZIP da source não tem dados Guest GoFile válidos.');
 if(Number(sourceFile.size)>600*1024*1024)throw Error('A leitura pela IA aceita ZIPs de até 600 MB e projetos de até 3 GB descompactados.');
 const jobId=crypto.randomUUID(),job={job_id:jobId,task,source_id:sourceId,channel_id:channel,user_id:user,source_url:sourceFile.directUrl,source_guest_token:sourceFile.guestToken,archive_file_id:sourceFile.fileId||'',status:'queued',created_at:Date.now(),file_index:extra.file_index??'',instruction:extra.instruction||''};
 if(task==='edit'){
  const manifest=JSON.parse(await env.TICKETS.get(aiProjectKey(channel,user,sourceId))||'null'),file=manifest?.archive_file_id===job.archive_file_id?manifest.files?.[Number(job.file_index)]:null;
  if(!file)throw Error('A lista de arquivos expirou ou pertence a outra versão. Use /editar e escolha a source novamente.');
  if(!file.editable)throw Error('Esse arquivo é binário, está protegido, é um link simbólico ou passa de 64 KB. Escolha um arquivo de texto/código menor.');
  if(typeof job.instruction!=='string'||job.instruction.trim().length<5||job.instruction.length>1800)throw Error('Escreva uma instrução de 5 a 1.800 caracteres.');
  job.file_path=file.path;
 }
 await env.TICKETS.put(aiJobKey(jobId),JSON.stringify(job),{expirationTtl:86400});
 const title=task==='index'?'📂 Lendo o projeto Android':'🧠 Editando arquivo com a Aurora AI';
 const message=await discord(env,`/channels/${channel}/messages`,{method:'POST',body:JSON.stringify({embeds:[{author:{name:'AURORA ANDROID ENGINE'},title,description:task==='index'?'Baixando o ZIP do GoFile e montando o inventário. A grade aparecerá aqui quando a análise terminar.':'A IA está alterando somente o arquivo escolhido e preparando uma nova versão do ZIP.',color:0x7657e8,footer:{text:`Tarefa ${jobId.slice(0,8)} · ZIP 600 MB / 3 GB extraído`}}],allowed_mentions:{parse:[]}})});
 job.message_id=message.id;await env.TICKETS.put(aiJobKey(jobId),JSON.stringify(job),{expirationTtl:86400});
 try{
  const endpoint=`https://api.github.com/repos/${encodeURIComponent(env.GITHUB_USER)}/${encodeURIComponent(env.GITHUB_REPO)}/actions/workflows/aurora-ai.yml/dispatches`,inputs={task,job_id:jobId,source_id:sourceId,channel_id:channel,user_id:user,worker_url:workerUrl,file_index:String(job.file_index),instruction:job.instruction};
  const response=await fetch(endpoint,{method:'POST',headers:{Authorization:`Bearer ${env.GITHUB_TOKEN}`,'User-Agent':'Aurora-Android-Engine/1.0',Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'},body:JSON.stringify({ref:env.GITHUB_REF,inputs}),signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw Error(`GitHub Actions recusou a tarefa (HTTP ${response.status}): ${(await response.text()).slice(0,350)}`);
  return job;
 }catch(error){job.status='failure';job.error=String(error.message).slice(0,700);await env.TICKETS.put(aiJobKey(jobId),JSON.stringify(job),{expirationTtl:86400});await discord(env,`/channels/${channel}/messages/${message.id}`,{method:'PATCH',body:JSON.stringify({embeds:[{author:{name:'AURORA ANDROID ENGINE'},title:'❌ Não foi possível iniciar a tarefa de IA',description:job.error,color:0xe74c3c,footer:{text:`Tarefa ${jobId.slice(0,8)}`}}]})}).catch(()=>{});throw error}
}
async function beginAiTask(i,env,sourceId,task,extra={},workerUrl=''){
 const user=uid(i),channel=i.channel_id,owner=await env.TICKETS.get(`owner:${channel}`);if(!owner||owner!==user)throw Error('Somente o dono do ticket pode usar a edição por IA.');
 const items=JSON.parse(await env.TICKETS.get(`sources:${channel}:${user}`)||'[]'),source=items.find(item=>item.id===sourceId&&item.status==='approved');if(!source)throw Error('A source não está aprovada ou não pertence a este ticket.');
 return dispatchAiTask(env,sourceId,source.edited_file||source.original_file,channel,user,task,extra,workerUrl);
}
async function filePage(i,env){
 const match=/^aurora-files-page:([a-f0-9-]{36}):(\d+)$/.exec(i.data.custom_id||'');if(!match)return reply('Página de arquivos inválida.',true);
 const [,sourceId,pageText]=match,owner=await env.TICKETS.get(`owner:${i.channel_id}`),user=uid(i);if(!owner||owner!==user)return reply('Somente o dono do ticket pode navegar por esses arquivos.',true);
 const items=JSON.parse(await env.TICKETS.get(`sources:${i.channel_id}:${owner}`)||'[]'),source=items.find(item=>item.id===sourceId&&item.status==='approved'),manifest=JSON.parse(await env.TICKETS.get(aiProjectKey(i.channel_id,user,sourceId))||'null');
 if(!source||!manifest)return reply('A lista de arquivos expirou. Use /editar para gerar outra.',true);
 return Response.json({type:7,data:fileGridPayload(source,manifest,Number(pageText))});
}
async function editSourceMenu(i,env){
 const owner=await env.TICKETS.get(`owner:${i.channel_id}`);
 if(!owner)return reply('Use /editar dentro de um ticket.',true);
 if(owner!==uid(i))return reply('Somente o dono do ticket pode editar suas sources.',true);
 const items=JSON.parse(await env.TICKETS.get(`sources:${i.channel_id}:${owner}`)||'[]');
 const eligible=items.filter(x=>x.status==='approved');
 if(!eligible.length)return reply('📂 Nenhuma source aprovada neste ticket. Use /enviar-zip para enviar um projeto grande ou /importar com um link direto menor.',true);
 return Response.json({type:4,data:{flags:64,content:'🧠 **Aurora AI — Escolha a source que deseja editar:**',components:[{type:1,components:[{type:3,custom_id:'aurora_edit_select',placeholder:'Selecione uma source deste ticket',min_values:1,max_values:1,options:eligible.slice(0,25).map((x,n)=>({label:`Source ${n+1} • ${x.id.slice(0,8)}`,description:(x.summary||'Projeto salvo').slice(0,90),value:x.id}))}]}]}});
}
async function editSelection(i,env,ctx,workerUrl=''){
 const owner=await env.TICKETS.get(`owner:${i.channel_id}`);if(!owner||(owner!==uid(i)&&!admin(i)))return reply('Sem acesso ao ticket.',true);
 const id=i.data.values?.[0],items=JSON.parse(await env.TICKETS.get(`sources:${i.channel_id}:${owner}`)||'[]'),source=items.find(x=>x.id===id&&x.status==='approved');if(!source)return reply('Source indisponível.',true);
 const file=source.edited_file||source.original_file,manifest=JSON.parse(await env.TICKETS.get(aiProjectKey(i.channel_id,owner,id))||'null');
 if(manifest&&manifest.archive_file_id===(file?.fileId||'')){ctx.waitUntil(publishFileGrid(env,i.channel_id,source,manifest).catch(e=>editReply(i,{content:`❌ Não consegui abrir o explorador: ${String(e.message).slice(0,300)}`})));return defer()}
 ctx.waitUntil(beginAiTask(i,env,id,'index',{},workerUrl).then(()=>editReply(i,{content:'📂 Iniciei a leitura do projeto. A grade de arquivos será publicada neste ticket quando terminar.'})).catch(e=>editReply(i,{content:`❌ Não consegui iniciar a leitura: ${String(e.message).slice(0,450)}`})));return defer();
}
async function openFileModal(i,env){
 const match=/^aurora-file:([a-f0-9-]{36}):(\d+)$/.exec(i.data.custom_id||'');if(!match)return reply('Seleção de arquivo inválida.',true);
 const [,sourceId,indexText]=match,owner=await env.TICKETS.get(`owner:${i.channel_id}`),user=uid(i);if(!owner||owner!==user)return reply('Somente o dono do ticket pode editar este arquivo.',true);
 const items=JSON.parse(await env.TICKETS.get(`sources:${i.channel_id}:${owner}`)||'[]'),source=items.find(item=>item.id===sourceId&&item.status==='approved'),manifest=JSON.parse(await env.TICKETS.get(aiProjectKey(i.channel_id,user,sourceId))||'null'),file=source?manifest?.files?.[Number(indexText)]:null;
 if(!file)return reply('Arquivo ou lista indisponível. Use /editar para carregar o projeto novamente.',true);
 return Response.json({type:9,data:{custom_id:`aurora_edit_modal:${sourceId}:${indexText}`,title:`Editar: ${clipped(file.path,40)}`,components:[{type:1,components:[{type:4,custom_id:'instruction',label:'O que você quer alterar?',style:2,min_length:5,max_length:1800,required:true,placeholder:'Descreva a mudança que deseja neste arquivo…'}]}]}});
}
async function editModal(i,env,ctx,workerUrl=''){
 const match=/^aurora_edit_modal:([a-f0-9-]{36}):(\d+)$/.exec(i.data.custom_id||'');if(!match)return reply('Painel de edição inválido.',true);
 const [,sourceId,indexText]=match,instruction=modalField(i,'instruction');
 ctx.waitUntil(beginAiTask(i,env,sourceId,'edit',{file_index:indexText,instruction},workerUrl).then(()=>editReply(i,{content:'🧠 Pedido enviado. A Aurora está editando somente o arquivo escolhido e publicará a nova versão aqui.'})).catch(e=>editReply(i,{content:`❌ Não consegui iniciar a edição: ${String(e.message).slice(0,450)}`})));return defer();
}
const BUILD_STEPS=['Preparando ambiente','Extraindo arquivos do projeto','Detectando configurações e dependências','Configurando Java e Android SDK','Preparando Gradle','Compilando o aplicativo','Localizando o APK','Enviando APK ao GoFile','Finalizando compilação'];
function buildStatusText(b){if(b.status==='queued')return '⏳ Aguardando o GitHub iniciar o runner';if(b.status==='running')return `🔄 Etapa ${Math.max(1,Number(b.step)+1)}/${BUILD_STEPS.length}: ${b.stage||'Compilação em andamento'}`;if(b.status==='success')return '✅ APK compilado e enviado ao GoFile';if(b.status==='failure')return '❌ A compilação falhou';if(b.status==='cancelled')return '⚠️ Build destravada manualmente';return '⏳ Preparando compilação'}
function buildProgressText(b){const step=Number(b.step??-1);return BUILD_STEPS.map((label,index)=>{let icon='▫️';if(b.status==='success'||((b.status==='running'||b.status==='failure'||b.status==='cancelled')&&index<step))icon='✅';else if(b.status==='running'&&index===step)icon='🔄';else if(b.status==='failure'&&index===step)icon='❌';else if(b.status==='cancelled'&&index===step)icon='⏹️';return `${icon} ${label}`}).join('\n')}
function buildEmbed(b){const fields=[{name:'Status',value:buildStatusText(b),inline:false},{name:'Etapas da compilação',value:buildProgressText(b),inline:false}];if(b.download_url)fields.push({name:'📦 APK pronto',value:`[Baixar pelo GoFile](${b.download_url})`,inline:false});if(b.error)fields.push({name:'Detalhes',value:String(b.error).slice(0,900),inline:false});return {embeds:[{author:{name:'AURORA ANDROID ENGINE'},title:'🏗️ Compilação Android',description:'Todas as etapas ficam nesta mensagem e são marcadas conforme a build avança.',color:b.status==='success'?0x35b779:b.status==='failure'?0xe74c3c:0x7657e8,fields,footer:{text:`Build ${b.id.slice(0,8)} • Aurora`},timestamp:new Date().toISOString()}],allowed_mentions:{parse:[]}}}async function updateBuildMessage(env,b){if(!b.message_id)return;await discord(env,`/channels/${b.channel_id}/messages/${b.message_id}`,{method:'PATCH',body:JSON.stringify(buildEmbed(b))})}
function buildModal(){return Response.json({type:9,data:{custom_id:'modal_compilar',title:'Compilar aplicativo Android',components:[{type:1,components:[{type:4,custom_id:'zip_url_input',label:'Link público do ZIP',style:1,required:true,max_length:1000,placeholder:'https://…'}]},{type:1,components:[{type:4,custom_id:'zip_password_input',label:'Senha do ZIP (opcional)',style:1,required:false,max_length:200,placeholder:'Deixe vazio se não houver senha'}]}]}})}
function modalField(i,id){return i.data.components?.flatMap(r=>r.components||[]).find(c=>c.custom_id===id)?.value||''}
async function startBuild(i,env,url,password,workerUrl){
 const user=uid(i),channel=i.channel_id,owner=await env.TICKETS.get(`owner:${channel}`);
 if(!owner||(owner!==user&&!admin(i)))throw Error('Use dentro do seu ticket de compilação.');
 if(!isHttps(url))throw Error('Informe um link HTTPS público para o ZIP.');
 for(const key of ['GITHUB_TOKEN','GITHUB_USER','GITHUB_REPO','GITHUB_REF'])if(!env[key])throw Error(`Configure ${key} nos secrets/variáveis do Worker.`);
 if(!env.CALLBACK_SECRET)throw Error('Configure CALLBACK_SECRET no Worker e nos GitHub Actions Secrets.');
 const lockKey=`build_lock:${user}`;if(await env.TICKETS.get(lockKey))throw Error('Você já tem uma compilação em andamento.');
 const id=crypto.randomUUID(),build={id,user_id:user,channel_id:channel,status:'queued',step:-1,created_at:Date.now()};
 await env.TICKETS.put(lockKey,id,{expirationTtl:7200});
 try{
  const message=await discord(env,`/channels/${channel}/messages`,{method:'POST',body:JSON.stringify(buildEmbed(build))});
  build.message_id=message.id;await env.TICKETS.put(`build:${id}`,JSON.stringify(build),{expirationTtl:86400});
  const endpoint=`https://api.github.com/repos/${encodeURIComponent(env.GITHUB_USER)}/${encodeURIComponent(env.GITHUB_REPO)}/actions/workflows/engine.yml/dispatches`;
  const response=await fetch(endpoint,{method:'POST',headers:{Authorization:`Bearer ${env.GITHUB_TOKEN}`,'User-Agent':'Aurora-Android-Engine/1.0',Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'},body:JSON.stringify({ref:env.GITHUB_REF,inputs:{zip_url:url,zip_password:password||'',channel_id:channel,user_id:user,worker_url:workerUrl||env.WORKER_URL||'',build_id:id}}),signal:AbortSignal.timeout(20000)});
  if(!response.ok){const detail=(await response.text()).slice(0,400);if(response.status===422&&detail.includes('Unexpected inputs')&&detail.includes('build_id'))throw Error('O workflow no GitHub está desatualizado: ele não aceita build_id e ainda pode estar usando o fluxo antigo de R2. Atualize os arquivos .github/workflows/engine.yml e scripts do branch configurado em GITHUB_REF usando o projeto Aurora-Bot-Atualizado.');throw Error(`GitHub Actions recusou a build (HTTP ${response.status}): ${detail}`)}
  await editReply(i,{content:'✅ Build iniciada! O progresso e o APK aparecerão na mensagem abaixo.'});
 }catch(e){build.status='failure';build.error=String(e.message).slice(0,900);await env.TICKETS.put(`build:${id}`,JSON.stringify(build),{expirationTtl:86400});await env.TICKETS.delete(lockKey);try{await updateBuildMessage(env,build)}catch{}throw e}
}
function startBuildDeferred(i,env,url,password,workerUrl,ctx){ctx.waitUntil(startBuild(i,env,url,password,workerUrl).catch(async e=>{try{await editReply(i,{content:`❌ Não foi possível iniciar: ${String(e.message).slice(0,500)}`})}catch(error){console.error('Build interaction:',error)}}));return defer()}async function callback(request,env){
 if(!env.CALLBACK_SECRET||request.headers.get('Authorization')!==`Bearer ${env.CALLBACK_SECRET}`)return new Response('Unauthorized',{status:401});
 let p;try{p=await request.json()}catch{return new Response('Bad JSON',{status:400})}
 const {user_id,channel_id,status,download_url,error,build_id}=p;
 if(!user_id||!channel_id||!status||!build_id)return new Response('Missing fields',{status:400});
 const normalized={queued:'queued',running:'running',success:'success',failure:'failure',failed:'failure'}[status];
 if(!normalized)return new Response('Invalid status',{status:400});
 const key=`build_lock:${user_id}`,activeId=await env.TICKETS.get(key),id=build_id;
 if(!id||(activeId&&id!==activeId))return new Response('Build not found or stale',{status:404});
 const raw=await env.TICKETS.get(`build:${id}`);
 if(!raw)return new Response('Build record not found',{status:404});
 const build=JSON.parse(raw);
 if(build.channel_id!==channel_id||build.user_id!==user_id)return new Response('Build mismatch',{status:403});
 if(['success','failure','cancelled'].includes(build.status))return new Response('Build already finished',{status:409});
 if(normalized==='success'&&(!download_url||!isHttps(download_url)))return new Response('Valid HTTPS download_url required',{status:400});
 if(normalized==='failure'&&!error)return new Response('Failure description required',{status:400});
 build.status=normalized;
 if(download_url&&isHttps(download_url))build.download_url=download_url;
 if(error)build.error=String(error).slice(0,900);
 await env.TICKETS.put(`build:${id}`,JSON.stringify(build),{expirationTtl:86400});
 try{await updateBuildMessage(env,build)}catch(e){console.error('Build update:',e)}
 if(normalized==='success'||normalized==='failure')await env.TICKETS.delete(key);
 return new Response('OK');
}

async function aiSourceRoute(request,env){
 if(request.method!=='GET')return new Response('Method Not Allowed',{status:405,headers:{Allow:'GET'}});
 if(!env.CALLBACK_SECRET||request.headers.get('Authorization')!==`Bearer ${env.CALLBACK_SECRET}`)return new Response('Unauthorized',{status:401});
 const jobId=new URL(request.url).searchParams.get('job_id')||'';if(!/^[a-f0-9-]{36}$/i.test(jobId))return new Response('Invalid job id',{status:400});
 const raw=await env.TICKETS.get(aiJobKey(jobId));if(!raw)return new Response('AI task not found',{status:404});
 const job=JSON.parse(raw);if(!['queued','running'].includes(job.status)||!validGofileUrl(job.source_url)||!/^[-A-Za-z0-9._~]{12,4096}$/.test(String(job.source_guest_token||'')))return new Response('Source credentials unavailable',{status:409});
 return Response.json({source_url:job.source_url,guest_token:job.source_guest_token},{headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}

async function aiCallback(request,env){
 if(!env.CALLBACK_SECRET||request.headers.get('Authorization')!==`Bearer ${env.CALLBACK_SECRET}`)return new Response('Unauthorized',{status:401});
 let p;try{p=await request.json()}catch{return new Response('Bad JSON',{status:400})}
 const {job_id,task,source_id,channel_id,user_id,status}=p;
 if(!/^[a-f0-9-]{36}$/i.test(job_id||'')||!['index','edit'].includes(task)||!/^[a-f0-9-]{36}$/i.test(source_id||'')||!/^\d{15,25}$/.test(channel_id||'')||!/^\d{15,25}$/.test(user_id||'')||!['success','failure'].includes(status))return new Response('Invalid payload',{status:400});
 const raw=await env.TICKETS.get(aiJobKey(job_id));if(!raw)return new Response('AI task not found',{status:404});
 const job=JSON.parse(raw);if(job.task!==task||job.source_id!==source_id||job.channel_id!==channel_id||job.user_id!==user_id)return new Response('AI task mismatch',{status:403});
 if(job.status==='success'||job.status==='failure')return new Response('AI task already finished',{status:409});
 if(await env.TICKETS.get(`owner:${channel_id}`)!==user_id)return new Response('Ticket is closed or owner changed',{status:409});
 const key=`sources:${channel_id}:${user_id}`,items=JSON.parse(await env.TICKETS.get(key)||'[]'),source=items.find(item=>item.id===source_id&&item.status==='approved');
 if(!source)return new Response('Source is no longer approved',{status:409});
 const sourceFile=source.edited_file||source.original_file;if(!sourceFile||sourceFile.fileId!==job.archive_file_id)return new Response('Source version changed',{status:409});
 if(status==='failure'){
  job.status='failure';job.error=String(p.error||'A tarefa de IA falhou.').slice(0,700);await env.TICKETS.put(aiJobKey(job_id),JSON.stringify(job),{expirationTtl:86400});
  if(job.message_id)await discord(env,`/channels/${channel_id}/messages/${job.message_id}`,{method:'PATCH',body:JSON.stringify({embeds:[{author:{name:'AURORA ANDROID ENGINE'},title:task==='index'?'❌ Falha ao ler o projeto':'❌ Falha na edição do arquivo',description:job.error,color:0xe74c3c,footer:{text:`Tarefa ${job_id.slice(0,8)}`}}]})}).catch(()=>{});
  return Response.json({ok:true});
 }
 if(task==='index'){
  if(!Array.isArray(p.files)||p.files.length>10000||typeof p.project_context!=='string')return new Response('Invalid project inventory',{status:400});
  const files=[];for(const file of p.files){if(!file||typeof file.path!=='string'||!file.path.length||file.path.length>1000||file.path.startsWith('/')||file.path.includes('..')||file.path.includes('\\')||/[\r\n]/.test(file.path)||!Number.isSafeInteger(Number(file.size))||Number(file.size)<0)return new Response('Invalid file entry',{status:400});files.push({path:file.path,size:Number(file.size),editable:file.editable===true,encrypted:file.encrypted===true})}
  if(!files.length)return new Response('Project archive is empty',{status:400});
  const manifest={archive_file_id:sourceFile.fileId||'',files,context:p.project_context.slice(0,5000),archive_size:Number(p.archive_size)||sourceFile.size||0,unpacked_size:Number(p.unpacked_size)||0,indexed_at:new Date().toISOString()};
  await env.TICKETS.put(aiProjectKey(channel_id,user_id,source_id),JSON.stringify(manifest),{expirationTtl:30*86400});
  job.status='success';job.file_count=files.length;await env.TICKETS.put(aiJobKey(job_id),JSON.stringify(job),{expirationTtl:86400});
  await publishFileGrid(env,channel_id,source,manifest,0,job.message_id).catch(e=>console.error('Publish AI file grid:',String(e.message)));
  return Response.json({ok:true});
 }
 const edited=p.edited_file;if(!edited||! /^[a-f0-9-]{8,80}$/i.test(String(edited.fileId||''))||!validGofileUrl(edited.downloadPage)||!validGofileUrl(edited.directUrl)||!/^[-A-Za-z0-9._~]{12,4096}$/.test(String(edited.guestToken||''))||!Number.isSafeInteger(Number(edited.size))||Number(edited.size)<4||Number(edited.size)>ZIP_UPLOAD_LIMIT)return new Response('Invalid edited GoFile metadata',{status:400});
 const path=String(p.file_path||'');if(path!==job.file_path||path.length>1000)return new Response('Edited file mismatch',{status:403});
 if(!Number.isSafeInteger(Number(p.target_size))||Number(p.target_size)<0||!Number.isSafeInteger(Number(p.target_chars))||Number(p.target_chars)<0)return new Response('Invalid edited file size',{status:400});
 const summary=String(p.summary||'Arquivo alterado pela Aurora AI.').slice(0,650),created=new Date().toISOString(),id=crypto.randomUUID();
 const version={id,original_file:sourceFile,edited_file:edited,summary,status:'pending',created,parent:source_id,file_path:path};items.unshift(version);await env.TICKETS.put(key,JSON.stringify(items.slice(0,30)));
 const manifest=JSON.parse(await env.TICKETS.get(aiProjectKey(channel_id,user_id,source_id))||'null');if(manifest){const target=manifest.files.find(file=>file.path===path);if(target){target.size=Number(p.target_size);target.editable=target.size<=64*1024&&Number(p.target_chars)<=16000}manifest.archive_file_id=edited.fileId;manifest.archive_size=Number(edited.size);manifest.unpacked_size=Number(p.unpacked_size)||manifest.unpacked_size;manifest.indexed_at=created;await env.TICKETS.put(aiProjectKey(channel_id,user_id,id),JSON.stringify(manifest),{expirationTtl:30*86400})}
 job.status='success';job.version_id=id;await env.TICKETS.put(aiJobKey(job_id),JSON.stringify(job),{expirationTtl:86400});
 if(job.message_id)await discord(env,`/channels/${channel_id}/messages/${job.message_id}`,{method:'PATCH',body:JSON.stringify({embeds:[{author:{name:'AURORA ANDROID ENGINE'},title:'✅ Nova versão pronta para revisar',description:`Arquivo alterado: \`${path}\`\n\n${summary}\n\nA versão completa foi enviada ao GoFile. Ela está pendente de aprovação.`,color:0x35b779,fields:[{name:'ID da versão',value:`\`${id}\``,inline:false},{name:'Próximos passos',value:`Use \`/baixar id:${id}\`, \`/aprovar id:${id}\` ou \`/rejeitar id:${id}\`.`,inline:false}],footer:{text:`Tarefa ${job_id.slice(0,8)} · Source preservada no GoFile`}}],components:[{type:1,components:[{type:2,style:5,label:'Baixar ZIP no GoFile',emoji:{name:'📦'},url:edited.downloadPage}]}],allowed_mentions:{parse:[]}})}).catch(e=>console.error('Publish AI edit result:',String(e.message)));
 return Response.json({ok:true});
}

async function progressCallback(request,env){
 if(!env.CALLBACK_SECRET||request.headers.get('Authorization')!==`Bearer ${env.CALLBACK_SECRET}`)return new Response('Unauthorized',{status:401});
 let p;try{p=await request.json()}catch{return new Response('Bad JSON',{status:400})}
 const {build_id,user_id,channel_id,stage}=p,step=Number(p.step);
 if(!/^[a-f0-9-]{36}$/i.test(build_id||'')||!/^\d{15,25}$/.test(user_id||'')||!/^\d{15,25}$/.test(channel_id||'')||!Number.isInteger(step)||step<0||step>8||typeof stage!=='string'||stage.length>120)return new Response('Invalid payload',{status:400});
 if(await env.TICKETS.get(`build_lock:${user_id}`)!==build_id)return new Response('Stale build',{status:409});
 const raw=await env.TICKETS.get(`build:${build_id}`);if(!raw)return new Response('Build not found',{status:404});
 const build=JSON.parse(raw);if(build.user_id!==user_id||build.channel_id!==channel_id)return new Response('Build mismatch',{status:403});
 if(!['queued','running'].includes(build.status))return new Response('Build already finished',{status:409});
 if(step<=Number(build.step??-1))return new Response('Duplicate or out of order',{status:200});
 build.status='running';build.step=step;build.stage=stage;
 let updated=false;for(let attempt=0;attempt<2;attempt++){try{await updateBuildMessage(env,build);updated=true;break}catch(e){if(attempt===1)console.error('Progress message update failed:',String(e.message));else await new Promise(resolve=>setTimeout(resolve,300))}}
 if(!updated)return new Response('Discord message update temporarily failed',{status:503});
 await env.TICKETS.put(`build:${build_id}`,JSON.stringify(build),{expirationTtl:86400});
 return new Response('OK');
}

// ============================================
// 💙 REGISTRO DOS COMANDOS VIA CLOUDFLARE
// ============================================
const AURORA_COMMANDS = [

{name:'setup-ticket',description:'Publica painel de tickets',default_member_permissions:'8'},
{name:'ticket',description:'Abre seu ticket privado'},
{name:'build-ticket',description:'Abre seu ticket de compilação Android'},
{name:'enviar-zip',description:'Abre o portal privado para enviar um ZIP neste ticket'},
{name:'fechar-ticket',description:'Fecha o ticket atual'},
{name:'seguranca',description:'Mostra o estado da segurança',default_member_permissions:'8'},
{name:'importar',description:'Registra um ZIP no ticket',options:[str('url','URL HTTPS direta do ZIP')]},
{name:'editar',description:'Escolha uma source do ticket e descreva a edição à Aurora AI'},
{name:'sources',description:'Lista as sources e versões do ticket'},
{name:'enviar-source',description:'Importa ZIP no ticket (comando antigo)',options:[str('url','URL HTTPS direta do ZIP')]},
{name:'versoes',description:'Lista versões de sources do ticket'},
{name:'historico',description:'Mostra histórico das versões no ticket'},
{name:'builds',description:'Informa onde acompanhar compilações'},
{name:'aprovar',description:'Aprova proposta de edição',options:[str('id','ID da versão')]},
{name:'rejeitar',description:'Rejeita proposta de edição',options:[str('id','ID da versão')]},
{name:'baixar',description:'Gera link temporário para baixar a source',options:[str('id','ID da versão')]},
{name:'compilar',description:'Dispara o compilador Android',options:[str('url','URL HTTPS direta do ZIP',false)]},
{name:'destravar',description:'Libera trava de build',options:[{name:'usuario',description:'Usuário (admin)',type:6,required:false}]}
,
{name:'registrar',description:'Atualiza os comandos da Aurora AI',default_member_permissions:'8'},
{name:'parar-build',description:'Libera um build travado (não cancela a execução remota)',options:[{name:'usuario',description:'Usuário (somente administradores)',type:6,required:false}]}
];
async function registerCommands(env, guildId) {
  const appId = env.DISCORD_APPLICATION_ID;
  if (!appId || !env.DISCORD_BOT_TOKEN) throw Error('Configure DISCORD_APPLICATION_ID e DISCORD_BOT_TOKEN.');
  if (!guildId || !/^\d{17,22}$/.test(String(guildId))) throw Error('DISCORD_GUILD_ID inválido.');
  const response = await fetch(`${API}/applications/${appId}/guilds/${guildId}/commands`, {
    method:'PUT',
    headers:{Authorization:`Bot ${env.DISCORD_BOT_TOKEN}`,'Content-Type':'application/json'},
    body:JSON.stringify(AURORA_COMMANDS)
  });
  if (!response.ok) throw Error(`Discord ${response.status}: ${(await response.text()).slice(0,350)}`);
  return (await response.json()).map(c=>c.name);
}
async function registerRoute(request, env) {
  if (request.method !== 'POST') return new Response('Method Not Allowed',{status:405});
  if (!env.REGISTER_SECRET || request.headers.get('Authorization') !== `Bearer ${env.REGISTER_SECRET}`) return new Response('Unauthorized',{status:401});
  try {
    const names=await registerCommands(env,env.DISCORD_GUILD_ID);
    return Response.json({ok:true,count:names.length,commands:names});
  } catch(error) {
    return Response.json({ok:false,error:String(error.message)},{status:502});
  }
}
async function stopBuild(i,env) {
  const target=opt(i,'usuario')||uid(i);
  if (target!==uid(i) && !admin(i)) return reply('❌ Apenas administradores podem liberar outros usuários.',true);
  const lockKey=`build_lock:${target}`;
  const id=await env.TICKETS.get(lockKey);
  if (!id) return reply('📊 Nenhuma trava de compilação encontrada.',true);
  const raw=await env.TICKETS.get(`build:${id}`);
  if(raw){
    const build=JSON.parse(raw);
    build.status='cancelled';
    build.error='Trava liberada manualmente. A execução remota pode continuar.';
    await env.TICKETS.put(`build:${id}`,JSON.stringify(build),{expirationTtl:86400});
    try {await updateBuildMessage(env,build)} catch(error) {console.error('Atualização de build:',error)}
  }
  // Não é cancelamento remoto: a execução do workflow pode continuar.
  await env.TICKETS.delete(lockKey);
  return reply('🔓 **Trava liberada!**\n⚠️ Isso não interrompe a compilação remota que já estiver executando.',true);
}

export default {async fetch(request,env,ctx){const url=new URL(request.url);if(url.pathname==='/ai-source')return aiSourceRoute(request,env);if(url.pathname==='/upload')return zipUploadRoute(request,env);if(url.pathname==='/admin/register')return registerRoute(request,env);if(url.pathname==='/build-callback'&&request.method==='POST')return callback(request,env);if(url.pathname==='/build-progress'&&request.method==='POST')return progressCallback(request,env);if(url.pathname==='/ai-callback'&&request.method==='POST')return aiCallback(request,env);if(request.method!=='POST')return new Response('Not Found',{status:404});const body=await request.text();const valid=await verifyKey(body,request.headers.get('x-signature-ed25519')||'',request.headers.get('x-signature-timestamp')||'',env.DISCORD_PUBLIC_KEY);if(!valid)return new Response('Invalid signature',{status:401});const i=JSON.parse(body);if(i.type===InteractionType.PING)return Response.json({type:InteractionResponseType.PONG});if(i.type===InteractionType.APPLICATION_COMMAND){const name=i.data.name;if(name==='registrar'){if(!admin(i))return reply('❌ Somente administradores.',true);try{const names=await registerCommands(env,i.guild_id);return reply(`💙 **Aurora AI atualizada!**\n✅ ${names.length} comandos registrados.`,true)}catch(error){return reply(`❌ Registro falhou: ${String(error.message).slice(0,450)}`,true)}}if(name==='parar-build')return stopBuild(i,env);if(name==='setup-ticket'){if(!admin(i))return reply('Somente administradores.',true);return buildTicketPanel()}if(name==='ticket'){if(!admin(i))return reply('Somente administradores podem publicar o painel.',true);ctx.waitUntil(publishSupportPanel(i,env,true).catch(e=>editReply(i,{content:'❌ '+String(e.message).slice(0,400)})));return defer()}if(name==='build-ticket'){ctx.waitUntil(makeTicket(i,env,new URL(request.url).origin).then(content=>editReply(i,{content})).catch(e=>editReply(i,{content:String(e.message)})));return defer()}if(name==='enviar-zip'){const owner=await env.TICKETS.get(`owner:${i.channel_id}`);if(!owner||(owner!==uid(i)&&!admin(i)))return reply('Use dentro do seu ticket.',true);ctx.waitUntil(createZipUploadLink(env,i.channel_id,uid(i),new URL(request.url).origin).then(link=>editReply(i,{content:'📦 Envie um ZIP de até 20 GB pelo portal privado. O arquivo será enviado diretamente ao GoFile e aparecerá em /sources.',components:[{type:1,components:[{type:2,style:5,label:'Abrir portal de ZIP',emoji:{name:'📤'},url:link}]}]})).catch(e=>editReply(i,{content:`❌ ${String(e.message).slice(0,300)}`})));return defer()}if(name==='fechar-ticket'){const owner=await env.TICKETS.get(`owner:${i.channel_id}`);if(!owner)return reply('Este canal não é um ticket.',true);if(owner!==uid(i)&&!admin(i))return reply('Sem permissão.',true);ctx.waitUntil((async()=>{await env.TICKETS.delete(`owner:${i.channel_id}`);await env.TICKETS.delete(`ticket:${i.guild_id}:${owner}`);await discord(env,`/channels/${i.channel_id}`,{method:'DELETE'})})().catch(console.error));return reply('🔒 Ticket encerrado.',true)}if(name==='seguranca'){if(!admin(i))return reply('Somente administradores.',true);return reply(`🛡️ Modo configurado: **${env.SECURITY_MODE||'delete'}**. O canal-armadilha requer um serviço Discord Gateway; o Worker sozinho não monitora mensagens.`,true)}if(name==='importar'||name==='enviar-source'){const owner=await env.TICKETS.get(`owner:${i.channel_id}`);if(owner!==uid(i)&&!admin(i))return reply('Use dentro do seu ticket.',true);ctx.waitUntil(importSource(i,env,opt(i,'url')).catch(e=>editReply(i,{content:`❌ ${e.message}`})));return defer()}if(name==='editar')return editSourceMenu(i,env);if(['aprovar','rejeitar','baixar'].includes(name)){const owner=await env.TICKETS.get(`owner:${i.channel_id}`);if(owner!==uid(i)&&!admin(i))return reply('Use dentro do seu ticket.',true);return manageVersion(i,env,name,opt(i,'id'),request)}if(name==='sources'||name==='versoes'||name==='historico'){const owner=await env.TICKETS.get(`owner:${i.channel_id}`);if(owner!==uid(i)&&!admin(i))return reply('Use dentro do seu ticket.',true);const items=JSON.parse(await env.TICKETS.get(`sources:${i.channel_id}:${uid(i)}`)||'[]');return reply(items.length?items.slice(0,10).map(x=>`• \`${x.id}\` — ${x.created} — ${x.summary}`).join('\n').slice(0,1900):'Nenhuma source editada neste ticket.',true)}if(name==='builds')return reply('📊 Acompanhe o status das compilações nas mensagens deste ticket. O histórico persistente ainda não foi implementado.',true);if(name==='compilar'){const zip=opt(i,'url');if(zip)return startBuildDeferred(i,env,zip,'',new URL(request.url).origin,ctx);const owner=await env.TICKETS.get('owner:'+i.channel_id);if(!owner||(owner!==uid(i)&&!admin(i)))return reply('Use dentro do seu ticket.',true);return buildModal()}if(name==='destravar')return stopBuild(i,env);}if(i.type===5&&i.data.custom_id==='modal_compilar')return startBuildDeferred(i,env,modalField(i,'zip_url_input'),modalField(i,'zip_password_input'),new URL(request.url).origin,ctx);if(i.type===5&&i.data.custom_id?.startsWith('aurora_edit_modal:'))return editModal(i,env,ctx,new URL(request.url).origin);if(i.type===InteractionType.MESSAGE_COMPONENT){const id=i.data.custom_id;if(id==='aurora_edit_select')return editSelection(i,env,ctx,new URL(request.url).origin);if(id.startsWith('aurora-file:'))return openFileModal(i,env);if(id.startsWith('aurora-files-page:'))return filePage(i,env);if(id==='compilar_apk'){const owner=await env.TICKETS.get(`owner:${i.channel_id}`);if(!owner||(owner!==uid(i)&&!admin(i)))return reply('Sem acesso a este ticket.',true);if(await env.TICKETS.get(`build_lock:${uid(i)}`))return reply('⚠️ Compilação em andamento.',true);return buildModal()}if(id==='aurora_edit_button')return editSourceMenu(i,env);if(id==='aurora_sources_button'){const owner=await env.TICKETS.get(`owner:${i.channel_id}`);if(!owner||(owner!==uid(i)&&!admin(i)))return reply('Sem acesso.',true);const items=JSON.parse(await env.TICKETS.get(`sources:${i.channel_id}:${owner}`)||'[]');return reply(items.length?items.slice(0,12).map(x=>`• ${x.id.slice(0,8)} — ${x.status} — ${x.summary}`).join('\n').slice(0,1900):'Nenhuma source cadastrada. Use /importar.',true)}if(id==='aurora:build-ticket-select'){if(i.data.values?.[0]!=='open')return reply('Seleção inválida.',true);ctx.waitUntil(makeTicket(i,env,new URL(request.url).origin).then(content=>editReply(i,{content})).catch(e=>editReply(i,{content:'❌ '+String(e.message).slice(0,400)})));return defer()}if(id==='support:select'){const category=i.data.values?.[0];if(!['buy','tech'].includes(category))return reply('Categoria inválida. Selecione uma das opções do painel.',true);ctx.waitUntil(createSupportTicket(i,env,category).then(content=>editReply(i,{content})).catch(e=>editReply(i,{content:'❌ '+String(e.message).slice(0,300)})));return defer()}if(id==='support:close'){const info=JSON.parse(await env.TICKETS.get('support:'+i.channel_id)||'null');if(!info||(info.owner_id!==uid(i)&&!admin(i)))return reply('Sem permissão para fechar este atendimento.',true);return Response.json({type:4,data:{flags:64,content:'Tem certeza que deseja fechar o atendimento?',components:[{type:1,components:[{type:2,style:4,label:'Confirmar fechamento',custom_id:'support:confirm-close'},{type:2,style:2,label:'Cancelar',custom_id:'support:cancel-close'}]}]}})}
if(id==='support:cancel-close')return reply('Fechamento cancelado.',true)
if(id==='support:confirm-close'){const info=JSON.parse(await env.TICKETS.get('support:'+i.channel_id)||'null');if(!info||(info.owner_id!==uid(i)&&!admin(i)))return reply('Sem permissão para fechar este atendimento.',true);ctx.waitUntil(closeSupportTicket(env,i.channel_id).catch(e=>console.error('Ticket close:',String(e.message))));return reply('🔒 Encerrando e registrando o atendimento.',true)}if(id==='aurora_open_ticket'){ctx.waitUntil(makeTicket(i,env,new URL(request.url).origin).then(content=>editReply(i,{content})).catch(e=>editReply(i,{content:`❌ ${e.message}`})));return defer()}if(id==='aurora_close_ticket'){const owner=await env.TICKETS.get(`owner:${i.channel_id}`);if(owner!==uid(i)&&!admin(i))return reply('Sem permissão.',true);ctx.waitUntil((async()=>{await env.TICKETS.delete(`owner:${i.channel_id}`);await env.TICKETS.delete(`ticket:${i.guild_id}:${owner}`);await discord(env,`/channels/${i.channel_id}`,{method:'DELETE'})})());return reply('🔒 Fechando ticket.',true)}}return reply('Comando não reconhecido.',true)}};
