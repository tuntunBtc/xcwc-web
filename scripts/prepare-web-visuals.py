"""Prepare small web derivatives. Preserve original artwork and alpha channels."""
from pathlib import Path
from PIL import Image
import argparse, hashlib, json
ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser()
parser.add_argument('--adopt-source',help='Deprecated compatibility option; this derivative is no longer generated.')
parser.add_argument('--cards-source',help='Deprecated compatibility option; this derivative is no longer generated.')
parser.add_argument('--nav-source',help='Deprecated compatibility option; this derivative is no longer generated.')
parser.parse_args()
jobs=[
 (ROOT/'assets/treehouse-background.png','assets/scenes/treehouse-960.webp',960,80),
 (ROOT/'assets/city-landscapes.png','assets/scenes/city-landscapes-1200.webp',1200,80),
 (ROOT/'assets/painted-props.png','assets/ui/painted-props-768.webp',768,82),
]
report=[]
for source,target,width,quality in jobs:
 with Image.open(source) as im:
  im.load(); size=im.size
  if im.width>width: im=im.resize((width,round(im.height*width/im.width)),Image.Resampling.LANCZOS)
  out=ROOT/target;out.parent.mkdir(parents=True,exist_ok=True)
  im.save(out,'WEBP',quality=quality,method=6,exact=True)
  report.append({'source':str(source),'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'source_bytes':source.stat().st_size,'source_size':size,'output':target,'size':im.size,'bytes':out.stat().st_size,'mode':im.mode})
(ROOT/'assets/web-visuals-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
for row in report:print(row['output'],row['size'],row['bytes'])
