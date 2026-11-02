import os, re, json, sys
src='src'; out='dist3'; os.makedirs(out, exist_ok=True)
gs=sorted([f for f in os.listdir(src) if f.endswith('.gs') and f!='Installer.gs'], key=lambda f:(f!='Config.gs', f))
code="/**\n * Prumo — todo o servidor num arquivo só (versão para colar). Config primeiro.\n */\n\n"
for f in gs: code+=f"// ===================== {f} =====================\n"+open(os.path.join(src,f),encoding='utf-8').read().rstrip()+"\n\n"
open(f'{out}/Codigo.gs','w',encoding='utf-8').write(code)
idx=open(os.path.join(src,'Index.html'),encoding='utf-8').read()
idx=re.sub(r"<\?!= include\('(\w+)'\) \?>", lambda m: open(os.path.join(src,m.group(1)+'.html'),encoding='utf-8').read(), idx)
assert '<?' not in idx
def esc_js(s):
    bad=re.findall(r'\\[^\x00-\x7f]', s); assert not bad, bad
    o=[]
    for ch in s:
        n=ord(ch)
        if n<128: o.append(ch)
        elif n<0x10000: o.append('\\u%04X'%n)
        else: n-=0x10000; o.append('\\u%04X\\u%04X'%(0xD800+(n>>10),0xDC00+(n&0x3FF)))
    return ''.join(o)
import subprocess as _sp
def sanitize(js):
    open('/tmp/_san.js','w',encoding='utf-8').write(js)
    r=_sp.run(['node','tools/sanitize.js','/tmp/_san.js'],capture_output=True,text=True)
    if r.returncode: print(r.stderr[:800]); sys.exit(1)
    out=r.stdout
    for bad in ['//','/*','\\`']:
        if bad in out: i=out.index(bad); print('sobrou', repr(bad), repr(out[max(0,i-80):i+40])); sys.exit(1)
    return out
idx=re.sub(r'(<script(?![^>]*\bsrc=)[^>]*>)(.*?)(</script>)', lambda m: m.group(1)+esc_js(sanitize(m.group(2)))+m.group(3), idx, flags=re.S)
# fora dos scripts: entidades HTML (exceto dentro de <style>, onde não há não-ASCII crítico)
def ent(seg): return ''.join(c if ord(c)<128 else '&#x%X;'%ord(c) for c in seg)
parts=re.split(r'(<script.*?</script>|<style.*?</style>)', idx, flags=re.S)
css=lambda seg: ''.join(c if ord(c)<128 else '\\%06X'%ord(c) for c in seg)
idx=''.join(p if p.startswith('<script') else css(p) if p.startswith('<style') else ent(p) for p in parts)
open(f'{out}/Index.html','w',encoding='utf-8').write(idx)
man=json.load(open(os.path.join(src,'appsscript.json')))
man['oauthScopes']=[s for s in man['oauthScopes'] if not s.endswith('script.projects')]
json.dump(man, open(f'{out}/appsscript.json','w'), indent=2, ensure_ascii=False)
na=[(i,c) for i,c in enumerate(idx) if ord(c)>127]
print('Index', os.path.getsize(f'{out}/Index.html')//1024,'KB; não-ASCII restantes (só CSS):', len(na), set(c for _,c in na))

# Simula o servidor do Google removendo /* ... */ de forma ingênua: cada script tem que continuar válido.
import subprocess
for i,m in enumerate(re.finditer(r'<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>', idx, re.S)):
    js=re.sub(r'/\*[\s\S]*?\*/', '', m.group(1))
    open('/tmp/_s.js','w').write(js)
    r=subprocess.run(['node','--check','/tmp/_s.js'],capture_output=True,text=True)
    if r.returncode: print('QUEBRA após remover comentários, script',i, r.stderr[:400]); sys.exit(1)
print('ok: todos os scripts sobrevivem à remoção de comentários')
