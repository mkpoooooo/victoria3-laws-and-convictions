"""Extract only declarative law/ideology fields; never execute game scripts."""
import re, json, hashlib, argparse
from datetime import datetime, timezone
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
arguments = argparse.ArgumentParser()
arguments.add_argument('--game-path', type=Path, required=True, help='Path to the Victoria 3 game directory')
GAME = arguments.parse_args().game_path.resolve()
OUT = ROOT / 'public' / 'game'
OUT.mkdir(parents=True, exist_ok=True)
SOURCES = ROOT / 'data' / 'sources'
SOURCES.mkdir(parents=True, exist_ok=True)
EXPLANATIONS = json.loads((ROOT / 'data' / 'law-explanations.json').read_text('utf-8'))
EXPLANATIONS_EN = json.loads((ROOT / 'data' / 'law-explanations-en.json').read_text('utf-8'))
previous_assets = {a['source']: a for a in json.loads((SOURCES/'asset-manifest.json').read_text('utf-8'))} if (SOURCES/'asset-manifest.json').exists() else {}

def parse(text):
    tokens = re.findall(r'"(?:\\.|[^"\\])*"|#[^\n]*|[{}]|[<>!?]?=|[^\s{}=<>!?#]+|[<>]', text.lstrip('\ufeff'))
    tokens = [t for t in tokens if not t.startswith('#')]
    i = 0
    def block():
        nonlocal i
        result = {'_items': []}
        while i < len(tokens):
            key = tokens[i]; i += 1
            if key == '}': return result
            if key == '{':
                result['_items'].append(block()); continue
            if i < len(tokens) and tokens[i] in ('=', '?=', '>=', '<=', '!=', '>', '<'):
                i += 1
                value = tokens[i]; i += 1
                if value == '{': value = block()
                elif value.startswith('"'): value = value[1:-1]
                result[key.strip('"')] = value
            else: result['_items'].append(key.strip('"'))
        return result
    return block()

install_manifest = GAME.parents[2] / 'appmanifest_529340.acf'
manifest_text = install_manifest.read_text('utf-8-sig')
installation = dict(re.findall(r'"(buildid|LastUpdated|BetaKey)"\s+"([^"]+)"', manifest_text))
branch = installation.get('BetaKey')
if branch != '1.14-openbeta':
    raise ValueError('Expected the authorized 1.14-openbeta branch; refusing to relabel another game version.')
build_id = installation['buildid']
captured_at = datetime.now(timezone.utc).isoformat()

def files(folder):
    result = {}
    for path in sorted((GAME / folder).glob('*.txt')):
        for key, val in parse(path.read_text('utf-8-sig')).items():
            if isinstance(val, dict): result[key] = (val, path.relative_to(GAME).as_posix())
    return result

def localization(language):
    result = {}
    for p in sorted((GAME / 'localization' / language).rglob('*.yml')):
        for line in p.read_text('utf-8-sig').splitlines():
            m = re.match(r'\s*([^\s:#]+):\s*(?:\d+\s*)?"(.*)"\s*$', line)
            if m: result[m[1]] = m[2]
    return result

ZH = localization('simp_chinese'); EN = localization('english')
def clean(text, depth=0, table=None):
    table = ZH if table is None else table
    if depth < 5:
        text = re.sub(r'\$([^$]+)\$', lambda m: clean(table.get(m[1], m[1]), depth+1, table), text)
    text = re.sub(r"\[Concept\('[^']+',\s*'([^']+)'\)\]", r'\1', text)
    text = re.sub(r'\[concept_([^\]]+)\]', lambda m: table.get('concept_'+m[1], m[1]), text)
    text = re.sub(r"\[Get(?:LawType|Ideology)\('([^']+)'\)\.GetName\]", lambda m: table.get(m[1], m[1]), text)
    text = re.sub(r'#[\w;,.:]+\s*|#!', '', text)
    return text.replace('\\n', '\n').replace('\\"', '"').strip()

asset_manifest = []
def asset(path, name=None):
    if not path or not (GAME / path).is_file(): return ''
    target = (name or Path(path).stem) + '.webp'
    img = Image.open(GAME / path).convert('RGBA')
    digest = hashlib.sha256((GAME/path).read_bytes()).hexdigest()
    if not (OUT / target).exists() or previous_assets.get(path, {}).get('sha256') != digest: img.save(OUT / target, 'WEBP', lossless=True)
    asset_manifest.append({'output': target, 'source': path, 'sha256': digest, 'size': img.size})
    return '/game/' + target

groups = []
all_groups = files('common/law_groups')
all_laws = files('common/laws')
excluded = {'law_chiefdom', 'law_colonial_administration', 'law_chartered_company', 'law_extraction_economy', 'law_elder_council', 'law_chiefs_distribute_aid'}
for gid, (g, path) in all_groups.items():
    if 'linked_social_hierarchy' in g or g.get('law_group_category') not in ('power_structure','economy','human_rights'): continue
    laws = []
    for lid, (law, lawpath) in all_laws.items():
        if law.get('group') != gid or lid in excluded or 'parent' in law: continue
        if lid not in ZH: raise ValueError('Missing law translation: '+lid)
        desc = clean(ZH.get(lid+'_desc', ''))
        if lid not in EXPLANATIONS: raise ValueError('Missing plain-language explanation: '+lid)
        if lid not in EN or lid+'_desc' not in EN or lid not in EXPLANATIONS_EN: raise ValueError('Missing English law content: '+lid)
        laws.append({'id':lid,'name':clean(ZH[lid]), 'english':clean(EN[lid],table=EN),'icon':asset(law.get('icon'),lid),'description':desc,'descriptionEnglish':clean(EN[lid+'_desc'],table=EN),'summary':EXPLANATIONS[lid],'summaryEnglish':EXPLANATIONS_EN[lid], 'source':lawpath})
    if laws: groups.append({'id':gid,'name':ZH.get(gid,gid),'english':EN.get(gid,gid),'category':g['law_group_category'],'laws':laws,'source':path})

opinions = {'strongly_disapprove':-2,'disapprove':-1,'neutral':0,'approve':1,'strongly_approve':2}
ideologies = []
for iid, (ideol, path) in files('common/ideologies').items():
    stances = {gid:{lid:opinions[stance] for lid,stance in val.items() if isinstance(stance,str) and stance in opinions} for gid,val in ideol.items() if gid.startswith('lawgroup_') and isinstance(val,dict)}
    if not stances: continue
    ideologies.append({'id':iid,'name':clean(ZH.get(iid,iid)), 'english':clean(EN.get(iid,iid),table=EN), 'description':clean(ZH.get(iid+'_desc','')),'descriptionEnglish':clean(EN.get(iid+'_desc',''),table=EN),'character':ideol.get('character_ideology')=='yes','icon':asset(ideol.get('icon'),iid),'stances':stances,'source':path})

igs=[]
for iid,(ig,path) in files('common/interest_groups').items():
    igs.append({'id':iid,'name':ZH.get(iid,iid),'english':clean(EN.get(iid,iid),table=EN),'description':clean(ZH.get(iid+'_desc','')),'descriptionEnglish':clean(EN.get(iid+'_desc',''),table=EN),'icon':asset(ig.get('texture'),iid),'ideologies':ig.get('ideologies',{}).get('_items',[]),'source':path})

textures = ['backgrounds/default_bg','backgrounds/default_bg_shading','backgrounds/paper_bg','backgrounds/paper_texture','backgrounds/header_bg_dec','backgrounds/header_borders','backgrounds/top_header_dec','backgrounds/entry_bg','backgrounds/simple_frame','backgrounds/round_frame_dec','backgrounds/divider_gold','backgrounds/colored_header','backgrounds/popup_bg','backgrounds/bg_tiling_pattern','backgrounds/big_header_pattern','buttons/default_button_bg','buttons/default_button_frame','buttons/default_button_mouseover','buttons/default_button_bg_action','icons/ig_icons/influential_ig_frame']
for tex in textures: asset('gfx/interface/'+tex+'.dds')

asset('gfx/interface/illustrations/top_illus/top_illu_diplomacy.dds')
source_paths = sorted(set(x['source'] for x in groups + ideologies + igs) | set(l['source'] for g in groups for l in g['laws']) | {'localization/simp_chinese/laws_l_simp_chinese.yml', 'localization/english/laws_l_english.yml', 'gui/politics_panel_constitution.gui', 'gui/interest_group_panel.gui'})
snapshot = []
source_paths = sorted(set(source_paths) | {'localization/english/interest_groups/interest_groups_l_english.yml', 'localization/simp_chinese/interest_groups/interest_groups_l_simp_chinese.yml'})
for rel in source_paths:
    payload = (GAME/rel).read_bytes()
    target = SOURCES/'snapshot'/rel
    target.parent.mkdir(parents=True,exist_ok=True)
    target.write_bytes(payload)
    snapshot.append({'path':rel,'sha256':hashlib.sha256(payload).hexdigest()})
(SOURCES/'snapshot-manifest.json').write_text(json.dumps(snapshot,indent=2),'utf-8')
data = {'meta':{'targetVersion':'1.14 公测版','buildId':build_id,'update':'2026-09-08' if build_id == '25207758' else datetime.fromtimestamp(int(installation['LastUpdated']),timezone.utc).date().isoformat(),'capturedAt':captured_at,'branch':branch,'verified':True,'dataNote':'本机原版法律与意识形态定义；不含 MOD、人物、国家和存档修正','assetOrigin':'本机游戏原版素材','language':'zh-CN','sourceFiles':len(snapshot)},'groups':groups,'ideologies':ideologies,'igs':igs}
(ROOT/'data'/'local-extracted.json').write_text(json.dumps(data,ensure_ascii=False,indent=2),'utf-8')
(ROOT/'public'/'game-data.json').write_text(json.dumps(data,ensure_ascii=False),'utf-8')
(SOURCES/'asset-manifest.json').write_text(json.dumps(asset_manifest,ensure_ascii=False,indent=2),'utf-8')
thumbs = Image.new('RGB',(1000,((len(textures)+4)//5)*150),'#253039'); draw=ImageDraw.Draw(thumbs)
for idx, tex in enumerate(textures):
    p = OUT/(Path(tex).name+'.webp')
    im=Image.open(p).convert('RGBA'); im.thumbnail((190,110))
    x=(idx%5)*200; y=(idx//5)*150
    thumbs.paste(im,(x,y),im); draw.text((x+3,y+112),Path(tex).name,fill='white')
(ROOT/'output').mkdir(exist_ok=True)
thumbs.save(ROOT/'output'/'texture-contact.png')
print(json.dumps({'groups':len(groups),'laws':sum(len(g['laws']) for g in groups),'characters':sum(i['character'] for i in ideologies),'ideologies':len(ideologies),'igs':len(igs),'assets':len(asset_manifest)}))
