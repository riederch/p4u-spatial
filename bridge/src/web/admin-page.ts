export function adminPage(): string {
  return String.raw`<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>P4U Spatial Admin</title>
<style>
:root{font-family:system-ui,sans-serif;color-scheme:light dark}
body{max-width:880px;margin:0 auto;padding:24px;line-height:1.45}
header{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:24px}
nav{display:flex;gap:12px;flex-wrap:wrap}
a{color:inherit}
.card{border:1px solid color-mix(in srgb,currentColor 22%,transparent);border-radius:14px;padding:18px;margin:14px 0}
.row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
input,button{font:inherit;padding:10px 12px;border-radius:9px;border:1px solid color-mix(in srgb,currentColor 28%,transparent)}
input{min-width:220px;flex:1}
button{cursor:pointer}
button.danger{border-color:#b33}
.muted{opacity:.72;font-size:.92em}
.hidden{display:none!important}
.notice{padding:12px 14px;border-radius:10px;background:color-mix(in srgb,currentColor 7%,transparent)}
.passkey{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 0;border-bottom:1px solid color-mix(in srgb,currentColor 14%,transparent)}
.passkey:last-child{border-bottom:0}
code{word-break:break-all}
</style>
</head>
<body>
<header>
  <div><strong>P4U Spatial</strong><div class="muted">Bridge Administration</div></div>
  <nav id="nav" class="hidden">
    <a href="/admin">Übersicht</a>
    <a href="/admin/credentials">Credentials</a>
    <a href="/admin/settings">Einstellungen</a>
    <button id="logout">Abmelden</button>
  </nav>
</header>

<div id="message" class="notice hidden"></div>

<section id="login" class="hidden">
  <h1>Anmelden</h1>
  <div id="passkey-login-card" class="card hidden">
    <h2>Passkey</h2>
    <p class="muted">Sicher anmelden, ohne Benutzername oder Passwort einzugeben.</p>
    <button id="passkey-login">Mit Passkey anmelden</button>
  </div>
  <div id="password-login-card" class="card hidden">
    <h2>Password + OTP</h2>
    <div class="row"><input id="login-username" autocomplete="username" placeholder="Username"></div>
    <div class="row"><input id="login-password" type="password" autocomplete="current-password" placeholder="Password"></div>
    <div class="row"><input id="login-totp" inputmode="numeric" autocomplete="one-time-code" placeholder="6-stelliger OTP-Code"></div>
    <button id="password-login">Anmelden</button>
  </div>
  <div id="bootstrap" class="card hidden">
    <h2>Ersteinrichtung</h2>
    <p class="muted">Übergangsweise wird für die erste Administrator-Identität noch der technische Admin-Key verwendet.</p>
    <div class="row"><input id="bootstrap-key" type="password" placeholder="Admin-Key"></div>
    <div class="row"><input id="bootstrap-username" placeholder="Username"><input id="bootstrap-display" placeholder="Anzeigename"></div>
    <button id="bootstrap-create">Administrator anlegen</button>
    <div id="bootstrap-methods" class="hidden">
      <hr>
      <p>Administrator angelegt. Jetzt mindestens eine Loginmethode einrichten:</p>
      <div class="row"><button id="bootstrap-passkey">Passkey hinzufügen</button></div>
      <div class="row"><input id="bootstrap-password" type="password" placeholder="Password (mind. 12 Zeichen)"><button id="bootstrap-password-start">Password + OTP einrichten</button></div>
      <div id="bootstrap-totp-confirm" class="hidden">
        <p>OTP-Secret: <code id="bootstrap-secret"></code></p>
        <div class="row"><input id="bootstrap-code" inputmode="numeric" placeholder="OTP-Code"><button id="bootstrap-confirm">OTP bestätigen</button></div>
      </div>
    </div>
  </div>
</section>

<section id="dashboard" class="hidden">
  <h1>Übersicht</h1>
  <div id="passkey-reminder" class="notice hidden">
    <div class="row">
      <div style="flex:1"><strong>Passkey-only verwenden?</strong><br><span class="muted">Du verwendest bereits einen Passkey. Du kannst Password + OTP deaktivieren, wenn du diesen Fallback nicht mehr brauchst.</span></div>
      <a href="/admin/credentials">Credentials bearbeiten</a>
      <button id="dismiss-reminder" aria-label="Hinweis schließen">×</button>
    </div>
  </div>
  <div class="card">
    <h2 id="welcome">Administrator</h2>
    <p>Die Bridge läuft und deine Administrator-Session ist aktiv.</p>
    <a href="/admin/credentials">Loginmethoden und Passkeys verwalten</a>
  </div>
</section>

<section id="credentials" class="hidden">
  <h1>Credentials</h1>
  <div class="card">
    <h2>Passkeys</h2>
    <div id="passkey-list"></div>
    <button id="add-passkey">Weiteren Passkey hinzufügen</button>
  </div>
  <div class="card">
    <h2>Password + OTP</h2>
    <div id="fallback-enabled" class="hidden">
      <p>Password + OTP ist als alternative Loginmethode aktiviert.</p>
      <button id="disable-fallback" class="danger">Password + OTP deaktivieren</button>
    </div>
    <div id="fallback-disabled" class="hidden">
      <p class="muted">Passkey-only ist aktiv. Optional kannst du Password + OTP als Fallback hinzufügen.</p>
      <div class="row"><input id="new-password" type="password" placeholder="Password (mind. 12 Zeichen)"><button id="start-fallback">Fallback einrichten</button></div>
    </div>
    <div id="totp-setup" class="hidden">
      <p>OTP-Secret: <code id="totp-secret"></code></p>
      <p class="muted">In einer Authenticator-App als TOTP hinzufügen. Die URI kann ebenfalls kopiert werden:</p>
      <code id="totp-uri"></code>
      <div class="row"><input id="totp-confirm-code" inputmode="numeric" placeholder="6-stelliger OTP-Code"><button id="confirm-fallback">Bestätigen</button></div>
    </div>
  </div>
</section>

<section id="settings" class="hidden">
  <h1>Einstellungen</h1>
  <div class="card">
    <p class="muted">Diese Konfiguration gehört der Bridge und wird persistent gespeichert. Änderungen werden nach einem Bridge-Neustart aktiv. Geheimnisse werden nicht zurückgelesen.</p>
    <textarea id="settings-json" style="width:100%;min-height:420px;font:13px ui-monospace,monospace"></textarea>
    <h3>Secrets ändern</h3>
    <div class="row"><input id="settings-git-token" type="password" placeholder="Git Token (leer = unverändert)"></div>
    <div class="row"><input id="settings-federation-token" type="password" placeholder="Federation Token (leer = unverändert)"></div>
    <div class="row"><button id="save-settings">Speichern</button></div>
  </div>
</section>

<script>
(function(){
  var state={me:null,status:null,setupId:null,bootstrapUserId:null,bootstrapSetupId:null};

  function el(id){return document.getElementById(id)}
  function show(id,on){el(id).classList.toggle('hidden',!on)}
  function message(text){el('message').textContent=text;show('message',!!text)}
  function cookie(name){
    var prefix=name+'=';
    return document.cookie.split(';').map(function(v){return v.trim()}).filter(function(v){return v.indexOf(prefix)===0})[0]?.slice(prefix.length);
  }
  function b64ToBytes(value){
    var s=value.replace(/-/g,'+').replace(/_/g,'/');
    while(s.length%4)s+='=';
    var raw=atob(s);var out=new Uint8Array(raw.length);
    for(var i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);
    return out;
  }
  function bytesToB64(value){
    var bytes=new Uint8Array(value);var raw='';
    for(var i=0;i<bytes.length;i++)raw+=String.fromCharCode(bytes[i]);
    return btoa(raw).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  }
  async function request(path,options){
    options=options||{};options.headers=options.headers||{};
    options.headers.Accept='application/json';
    if(options.body && !options.headers['Content-Type'])options.headers['Content-Type']='application/json';
    if(options.method && options.method!=='GET'){
      var csrf=decodeURIComponent(cookie('p4u_admin_csrf')||'');
      if(csrf)options.headers['X-P4U-CSRF']=csrf;
    }
    var response=await fetch(path,options);
    var text=await response.text();
    var data=text?JSON.parse(text):{};
    if(!response.ok)throw new Error(data.error?.message||('HTTP '+response.status));
    return data;
  }
  function createOptions(options){
    options.challenge=b64ToBytes(options.challenge);
    options.user.id=b64ToBytes(options.user.id);
    (options.excludeCredentials||[]).forEach(function(c){c.id=b64ToBytes(c.id)});
    return options;
  }
  function getOptions(options){
    options.challenge=b64ToBytes(options.challenge);
    (options.allowCredentials||[]).forEach(function(c){c.id=b64ToBytes(c.id)});
    return options;
  }
  function registrationJson(credential){
    return {
      id:credential.id,rawId:bytesToB64(credential.rawId),type:credential.type,
      response:{
        clientDataJSON:bytesToB64(credential.response.clientDataJSON),
        attestationObject:bytesToB64(credential.response.attestationObject),
        transports:credential.response.getTransports?credential.response.getTransports():undefined
      },
      clientExtensionResults:credential.getClientExtensionResults(),
      authenticatorAttachment:credential.authenticatorAttachment||undefined
    };
  }
  function authenticationJson(credential){
    return {
      id:credential.id,rawId:bytesToB64(credential.rawId),type:credential.type,
      response:{
        clientDataJSON:bytesToB64(credential.response.clientDataJSON),
        authenticatorData:bytesToB64(credential.response.authenticatorData),
        signature:bytesToB64(credential.response.signature),
        userHandle:credential.response.userHandle?bytesToB64(credential.response.userHandle):null
      },
      clientExtensionResults:credential.getClientExtensionResults(),
      authenticatorAttachment:credential.authenticatorAttachment||undefined
    };
  }
  async function loginPasskey(){
    message('');
    var init=await request('/api/v1/admin-auth/login/options',{method:'POST'});
    var credential=await navigator.credentials.get({publicKey:getOptions(init.options)});
    await request('/api/v1/admin-auth/login/verify',{method:'POST',body:JSON.stringify({ceremonyId:init.ceremonyId,response:authenticationJson(credential)})});
    location.href='/admin';
  }
  async function addPasskey(headers,userId){
    var body=userId?{userId:userId}:{};
    var init=await request('/api/v1/admin-auth/register/options',{method:'POST',headers:headers||{},body:JSON.stringify(body)});
    var credential=await navigator.credentials.create({publicKey:createOptions(init.options)});
    var name=prompt('Name für diesen Passkey','Passkey')||'Passkey';
    await request('/api/v1/admin-auth/register/verify',{method:'POST',headers:headers||{},body:JSON.stringify({ceremonyId:init.ceremonyId,response:registrationJson(credential),name:name})});
  }
  async function loadMe(){
    try{return await request('/api/v1/admin-auth/me')}catch(e){return null}
  }
  async function renderPasskeys(){
    var data=await request('/api/v1/admin-auth/passkeys');
    var root=el('passkey-list');root.textContent='';
    data.passkeys.forEach(function(p){
      var row=document.createElement('div');row.className='passkey';
      var label=document.createElement('div');
      label.innerHTML='<strong></strong><br><span class="muted"></span>';
      label.querySelector('strong').textContent=p.name||'Passkey';
      label.querySelector('span').textContent=p.createdAt;
      var actions=document.createElement('div');
      var rename=document.createElement('button');rename.textContent='Umbenennen';
      rename.onclick=async function(){
        var name=prompt('Neuer Name',p.name||'Passkey');if(!name)return;
        await request('/api/v1/admin-auth/passkeys/'+encodeURIComponent(p.id),{method:'PUT',body:JSON.stringify({name:name})});
        await renderPasskeys();
      };
      var remove=document.createElement('button');remove.textContent='Löschen';remove.className='danger';
      remove.onclick=async function(){
        if(!confirm('Diesen Passkey wirklich löschen?'))return;
        try{await request('/api/v1/admin-auth/passkeys/'+encodeURIComponent(p.id),{method:'DELETE'});await renderCredentials()}catch(e){message(e.message)}
      };
      actions.append(rename,remove);row.append(label,actions);root.append(row);
    });
  }
  async function renderCredentials(){
    state.me=await loadMe();if(!state.me){location.href='/admin';return}
    show('nav',true);show('credentials',true);
    await renderPasskeys();
    show('fallback-enabled',state.me.loginMethods.passwordTotp);
    show('fallback-disabled',!state.me.loginMethods.passwordTotp);
  }
  async function bootstrapRequest(path,body){
    return request(path,{method:'POST',headers:{'X-P4U-Admin-Key':el('bootstrap-key').value},body:JSON.stringify(body)});
  }
  async function bootstrapPasskey(){
    var headers={'X-P4U-Admin-Key':el('bootstrap-key').value};
    await addPasskey(headers,state.bootstrapUserId);
    location.reload();
  }
  async function renderSettings(){
    state.me=await loadMe();if(!state.me){location.href='/admin';return}
    show('nav',true);show('settings',true);
    var data=await request('/api/v1/admin/settings');
    var config=data.config||{};
    delete config.gitToken;delete config.federationToken;
    el('settings-json').value=JSON.stringify(config,null,2);
  }
  async function start(){
    state.status=await request('/api/v1/admin-auth/status');
    state.me=await loadMe();
    var credentialPage=location.pathname==='/admin/credentials';
    var settingsPage=location.pathname==='/admin/settings';
    if(state.me){
      show('nav',true);
      if(credentialPage){await renderCredentials();return}
      if(settingsPage){await renderSettings();return}
      show('dashboard',true);
      el('welcome').textContent=state.me.user.displayName||state.me.user.username;
      var both=state.me.loginMethods.passkey&&state.me.loginMethods.passwordTotp;
      show('passkey-reminder',both&&!cookie('p4u_passkey_only_reminder_dismissed'));
      return;
    }
    if(credentialPage||settingsPage){location.href='/admin';return}
    show('login',true);
    show('passkey-login-card',state.status.passkeyConfigured);
    show('password-login-card',state.status.passwordTotpConfigured);
    show('bootstrap',!state.status.passkeyConfigured&&!state.status.passwordTotpConfigured);
  }

  el('save-settings').onclick=async function(){
    try{
      var config=JSON.parse(el('settings-json').value);
      var gitToken=el('settings-git-token').value;
      var federationToken=el('settings-federation-token').value;
      if(gitToken)config.gitToken=gitToken;
      if(federationToken)config.federationToken=federationToken;
      var result=await request('/api/v1/admin/settings',{method:'PUT',body:JSON.stringify(config)});
      message(result.restartRequired?'Gespeichert. Bridge-Neustart erforderlich.':'Gespeichert.');
      el('settings-git-token').value='';el('settings-federation-token').value='';
    }catch(e){message(e.message)}
  };
  el('passkey-login').onclick=function(){loginPasskey().catch(function(e){message(e.message)})};
  el('password-login').onclick=async function(){
    try{
      await request('/api/v1/admin-auth/password-totp/login',{method:'POST',body:JSON.stringify({username:el('login-username').value,password:el('login-password').value,totp:el('login-totp').value})});
      location.href='/admin';
    }catch(e){message(e.message)}
  };
  el('logout').onclick=async function(){try{await request('/api/v1/admin-auth/logout',{method:'POST'});location.href='/admin'}catch(e){message(e.message)}};
  el('dismiss-reminder').onclick=function(){
    document.cookie='p4u_passkey_only_reminder_dismissed=1; Max-Age=31536000; Path=/admin; SameSite=Lax; Secure';
    show('passkey-reminder',false);
  };
  el('add-passkey').onclick=function(){addPasskey().then(renderCredentials).catch(function(e){message(e.message)})};
  el('start-fallback').onclick=async function(){
    try{
      var setup=await request('/api/v1/admin-auth/password-totp/setup',{method:'POST',body:JSON.stringify({password:el('new-password').value})});
      state.setupId=setup.setupId;el('totp-secret').textContent=setup.secret;el('totp-uri').textContent=setup.otpauthUri;show('totp-setup',true);
    }catch(e){message(e.message)}
  };
  el('confirm-fallback').onclick=async function(){
    try{await request('/api/v1/admin-auth/password-totp/setup/confirm',{method:'POST',body:JSON.stringify({setupId:state.setupId,code:el('totp-confirm-code').value})});show('totp-setup',false);await renderCredentials()}catch(e){message(e.message)}
  };
  el('disable-fallback').onclick=async function(){
    if(!confirm('Password + OTP deaktivieren und Passkey-only verwenden?'))return;
    try{await request('/api/v1/admin-auth/password-totp',{method:'DELETE'});await renderCredentials()}catch(e){message(e.message)}
  };
  el('bootstrap-create').onclick=async function(){
    try{
      var data=await bootstrapRequest('/api/v1/admin/users',{username:el('bootstrap-username').value,displayName:el('bootstrap-display').value});
      state.bootstrapUserId=data.user.userId;show('bootstrap-methods',true);message('Administrator angelegt. Jetzt Loginmethode einrichten.');
    }catch(e){message(e.message)}
  };
  el('bootstrap-passkey').onclick=function(){bootstrapPasskey().catch(function(e){message(e.message)})};
  el('bootstrap-password-start').onclick=async function(){
    try{
      var setup=await bootstrapRequest('/api/v1/admin-auth/password-totp/setup',{userId:state.bootstrapUserId,password:el('bootstrap-password').value});
      state.bootstrapSetupId=setup.setupId;el('bootstrap-secret').textContent=setup.secret;show('bootstrap-totp-confirm',true);
    }catch(e){message(e.message)}
  };
  el('bootstrap-confirm').onclick=async function(){
    try{
      await bootstrapRequest('/api/v1/admin-auth/password-totp/setup/confirm',{setupId:state.bootstrapSetupId,code:el('bootstrap-code').value});
      message('Password + OTP eingerichtet. Du kannst dich jetzt anmelden.');location.reload();
    }catch(e){message(e.message)}
  };

  start().catch(function(e){message(e.message)});
})();
</script>
</body>
</html>`;
}
