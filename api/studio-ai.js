// QuickCart Backend Studio — multi-provider AI gateway.
// Provider credentials are read only from server environment variables.
const { MAIN, enc, fbGet, fbPut, verifyTok, tokenOf, jbody, crypto } = require('./_qc');

const ROOT = MAIN + '/backups/platform_studio';
const out = (res, code, body) => res.status(code).json(body);
const clean = (v, max=160) => String(v == null ? '' : v).trim().slice(0,max);
const id = () => Date.now().toString(36) + '-' + crypto.randomBytes(5).toString('hex');

const PROVIDERS = {
  openai: { label:'OpenAI', env:'OPENAI_API_KEY', modelEnv:'OPENAI_MODEL', model:'gpt-4.1-mini', kind:'openai', url:'https://api.openai.com/v1/chat/completions' },
  anthropic: { label:'Anthropic Claude', env:'ANTHROPIC_API_KEY', modelEnv:'ANTHROPIC_MODEL', model:'claude-sonnet-4-5-20250929', kind:'anthropic', url:'https://api.anthropic.com/v1/messages' },
  gemini: { label:'Google Gemini', env:'GEMINI_API_KEY', modelEnv:'GEMINI_MODEL', model:'gemini-2.5-flash', kind:'gemini' },
  openrouter: { label:'OpenRouter', env:'OPENROUTER_API_KEY', modelEnv:'OPENROUTER_MODEL', model:'openai/gpt-4.1-mini', kind:'openai', url:'https://openrouter.ai/api/v1/chat/completions' },
  groq: { label:'Groq', env:'GROQ_API_KEY', modelEnv:'GROQ_MODEL', model:'llama-3.3-70b-versatile', kind:'openai', url:'https://api.groq.com/openai/v1/chat/completions' },
  deepseek: { label:'DeepSeek', env:'DEEPSEEK_API_KEY', modelEnv:'DEEPSEEK_MODEL', model:'deepseek-chat', kind:'openai', url:'https://api.deepseek.com/chat/completions' },
  xai: { label:'xAI Grok', env:'XAI_API_KEY', modelEnv:'XAI_MODEL', model:'grok-3-mini', kind:'openai', url:'https://api.x.ai/v1/chat/completions' },
  mistral: { label:'Mistral', env:'MISTRAL_API_KEY', modelEnv:'MISTRAL_MODEL', model:'mistral-small-latest', kind:'openai', url:'https://api.mistral.ai/v1/chat/completions' },
  together: { label:'Together AI', env:'TOGETHER_API_KEY', modelEnv:'TOGETHER_MODEL', model:'meta-llama/Llama-3.3-70B-Instruct-Turbo', kind:'openai', url:'https://api.together.xyz/v1/chat/completions' },
  fireworks: { label:'Fireworks AI', env:'FIREWORKS_API_KEY', modelEnv:'FIREWORKS_MODEL', model:'accounts/fireworks/models/llama-v3p3-70b-instruct', kind:'openai', url:'https://api.fireworks.ai/inference/v1/chat/completions' },
  cerebras: { label:'Cerebras', env:'CEREBRAS_API_KEY', modelEnv:'CEREBRAS_MODEL', model:'llama-3.3-70b', kind:'openai', url:'https://api.cerebras.ai/v1/chat/completions' },
  perplexity: { label:'Perplexity', env:'PERPLEXITY_API_KEY', modelEnv:'PERPLEXITY_MODEL', model:'sonar-pro', kind:'openai', url:'https://api.perplexity.ai/chat/completions' },
  custom: { label:'Custom OpenAI-compatible API', env:'CUSTOM_AI_API_KEY', modelEnv:'CUSTOM_AI_MODEL', model:'', kind:'openai', url:process.env.CUSTOM_AI_BASE_URL || '' }
};

const SYSTEM = `You are QuickCart's private Backend Studio engineering assistant. Help the platform owner plan, understand, review and implement changes to their existing ecommerce, storefront, inventory and POS platform.
Architecture facts: the application is a hybrid HTML/JavaScript frontend with selected React-built assets; Node serverless APIs run on Vercel; Firebase Realtime Database stores platform and merchant data; GitHub is the source repository. It is not a full React SPA or a traditional always-on Express server.
Safety rules:
- Never claim you changed repository files, ran tests, deployed, or published anything unless a separate tool explicitly confirms it.
- Treat all suggestions as proposals until the owner approves them.
- Preserve existing POS, checkout, payment, inventory, storefront, merchant isolation and data integrity.
- Never suggest exposing API keys, Firebase secrets, passwords or tokens in frontend code or Git commits.
- Prefer additive, reversible changes, isolated branches, staging data, tests and preview deployments.
- Do not execute destructive database operations or alter production data.
- Ask concise clarifying questions when requirements are ambiguous.
- Explain technical concepts in plain language. Provide practical implementation steps and acceptance tests.
You can draft code and architecture proposals in this conversation, but this chat endpoint does not itself commit code or deploy releases.`;

async function askOpenAICompatible(cfg, key, model, messages) {
  const r = await fetch(cfg.url, {
    method:'POST',
    headers:{'Authorization':'Bearer '+key,'Content-Type':'application/json'},
    body:JSON.stringify({model,messages,temperature:0.2})
  });
  const data=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(data.error?.message || cfg.label+' request failed ('+r.status+').');
  return data.choices?.[0]?.message?.content || '';
}
async function askAnthropic(cfg,key,model,messages) {
  const system=messages.find(m=>m.role==='system')?.content || SYSTEM;
  const turns=messages.filter(m=>m.role!=='system');
  const r=await fetch(cfg.url,{method:'POST',headers:{'x-api-key':key,'anthropic-version':'2023-06-01','content-type':'application/json'},
    body:JSON.stringify({model,system,max_tokens:4096,messages:turns})});
  const data=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(data.error?.message || cfg.label+' request failed ('+r.status+').');
  return (data.content||[]).filter(x=>x.type==='text').map(x=>x.text).join('\n');
}
async function askGemini(cfg,key,model,messages) {
  const system=messages.find(m=>m.role==='system')?.content || SYSTEM;
  const turns=messages.filter(m=>m.role!=='system').map(m=>({role:m.role==='assistant'?'model':'user',parts:[{text:m.content}]}));
  const url='https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(model)+':generateContent?key='+encodeURIComponent(key);
  const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({systemInstruction:{parts:[{text:system}]},contents:turns,generationConfig:{temperature:0.2,maxOutputTokens:4096}})});
  const data=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(data.error?.message || cfg.label+' request failed ('+r.status+').');
  return (data.candidates?.[0]?.content?.parts||[]).map(x=>x.text||'').join('\n');
}

module.exports = async (req,res) => {
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='POST') return out(res,405,{ok:false,error:'Method not allowed'});
  const session=verifyTok(tokenOf(req));
  if(!session || session.r!=='admin' || session.u!=='admin') return out(res,403,{ok:false,error:'Backend Studio is restricted to the platform Super Admin.'});
  try {
    const body=jbody(req);
    const action=clean(body.action,30);
    if(action==='config') {
      const providers=Object.entries(PROVIDERS).map(([id,cfg])=>({id,label:cfg.label,configured:!!process.env[cfg.env],model:process.env[cfg.modelEnv]||cfg.model}));
      return out(res,200,{ok:true,providers,defaultProvider:process.env.STUDIO_DEFAULT_AI_PROVIDER||'openai'});
    }
    if(action!=='chat') return out(res,400,{ok:false,error:'Unknown AI action.'});
    const provider=clean(body.provider,30).toLowerCase();
    const cfg=PROVIDERS[provider];
    if(!cfg) return out(res,400,{ok:false,error:'Choose a supported AI provider.'});
    if(provider==='custom' && (!cfg.url || !String(cfg.url).startsWith('https://'))) return out(res,503,{ok:false,error:'Set CUSTOM_AI_BASE_URL to a valid HTTPS chat-completions endpoint in Vercel.'});
    const key=process.env[cfg.env];
    if(!key) return out(res,503,{ok:false,error:cfg.label+' is not configured. Add '+cfg.env+' in Vercel Environment Variables and redeploy.'});
    const message=String(body.message||'').trim().slice(0,12000);
    if(!message) return out(res,400,{ok:false,error:'Write a message first.'});
    const model=clean(body.model||process.env[cfg.modelEnv]||cfg.model,120);
    if(!/^[a-zA-Z0-9._:/-]+$/.test(model)) return out(res,400,{ok:false,error:'Invalid model identifier.'});
    const conversation=clean(body.conversation,100).replace(/[^a-zA-Z0-9._-]/g,'-')||id();
    const prior=await fbGet(ROOT+'/conversations/'+enc(conversation));
    const history=Array.isArray(prior?.messages)?prior.messages.slice(-12):[];
    const messages=[{role:'system',content:SYSTEM},...history.map(m=>({role:m.role,content:String(m.content||'').slice(0,12000)})),{role:'user',content:message}];
    let answer='';
    if(cfg.kind==='anthropic') answer=await askAnthropic(cfg,key,model,messages);
    else if(cfg.kind==='gemini') answer=await askGemini(cfg,key,model,messages);
    else answer=await askOpenAICompatible(cfg,key,model,messages);
    if(!answer) throw new Error('The AI provider returned an empty response.');
    const saved=[...history,{role:'user',content:message,at:new Date().toISOString()},{role:'assistant',content:answer,at:new Date().toISOString()}].slice(-20);
    await fbPut(ROOT+'/conversations/'+enc(conversation),{provider,model,messages:saved,updatedAt:new Date().toISOString()});
    await fbPut(ROOT+'/audit/'+id(),{actor:'admin',action:'ai.message',detail:provider+' / '+model,at:new Date().toISOString()});
    return out(res,200,{ok:true,provider,model,conversation,answer});
  } catch(error) {
    console.error('[studio-ai]',error);
    return out(res,500,{ok:false,error:error.message||'AI request failed.'});
  }
};
